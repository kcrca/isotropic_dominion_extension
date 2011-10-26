(function() {
  // The card list is just to log the cards 10 at a time so I have a list of all
  // cards in groups I can request to use for testing.
  for (var i = 0; i < card_list.length; i++) {
    var card = card_list[i];
    card.isAction = function() {
      return this.Action != "0";
    };
    card.isTreasure = function() {
      return this.Treasure != "0";
    };
    card.isDuration = function() {
      return this.Duration != "0";
    };
    card.getBuys = function() {
      return parseInt(this.Buys);
    };
    card.getActions = function() {
      return parseInt(this.Actions);
    };
    card.getCoinCount = function() {
      return (
          this.Coins == "?" || this.Coins == "P" ? 0 : parseInt(this.Coins));
    };
    card.getPotionCount = function() {
      return (this.Coins == "P" ? 1 : 0);
    };
    card.getCoinCost = function() {
      var cost = this.Cost;
      cost = (cost.charAt(0) == 'P' ? cost.substr(1) : cost);
      return parseInt(cost);
    };
    card.getPotionCost = function() {
      return (this.Cost.indexOf("P") >= 0 ? 1 : 0);
    };
  }
})();

function HtmlView() {
  var maxTradeRoute = undefined;
  var seen_first_turn = false;

  // How many different player CSS classes are supported?
  //noinspection LocalVariableNamingConventionJS
  var PLAYER_CLASS_COUNT = 4;

  this.setupPlayer = function(player) {
    player.icon = undefined;

    // The set of "other" cards -- ones that aren't in the supply piles
    player.otherCards = {};

    if (player.isTable) {
      player.idPrefix = "table";
    } else {
      player.idPrefix = "player" + player.num;
    }

    // Return the player-specific name for a general category. player is typically
    // used for DOM node ID but can also be used as a DOM class name.
    player.idFor = function(category) {
      return player.idPrefix + "_" + toIdString(category);
    };

    // Define the general player class used for CSS styling
    if (player.name == "You") {
      player.classFor = "you";
    } else if (player.isTable) {
      player.classFor = "table";
    } else {
      // CSS cycles through PLAYER_CLASS_COUNT display classes
      player.classFor = "player" + ((player.num - 1) % PLAYER_CLASS_COUNT + 1);
    }

    // Remember the img node for the player's icon
    player.setIcon = function(imgNode) {
      if (imgNode == null) return;
      this.icon = imgNode.cloneNode(true);
      this.icon.removeAttribute('class');
      this.icon.setAttribute('align', 'top');
      $('#' + this.idFor('name')).contents().first().before(this.icon);
    };

    player.updateCardDisplay = function(name) {
      var cardId = this.idFor(name);
      var cardCountCell = document.getElementById(cardId);
      if (cardCountCell) {
        cardCountCell.innerHTML = this.cardCountString(name);
      }
    };

    // Add a card to a group of cards. Adding in the 'cardname' attribute means
    // that hovering over the card will pop up the tooltip window about the card.
    player.addToCardGroup = function(which, cardElem, count, updateField) {
      count = count != undefined ? count : 1;
      updateField = updateField != undefined ? updateField : true;
      var group = this[which];
      if (!group) group = this[which] = {};
      var cardName = getSingularCardName(cardElem.text());
      var cardInfo = group[cardName];
      if (!cardInfo) {
        cardInfo = group[cardName] = new Object();
        cardInfo.count = 0;
        cardInfo.card = card_map[cardName];
        if (!cardElem.attr('cardname')) {
          // we need a copy so we can add the 'cardname' attribute to it
          cardElem = cardElem.clone();
          cardElem.attr('cardname', cardName);
        }
        cardInfo.html = cardElem[0].outerHTML;
      }
      cardInfo.count += count;
      if (cardInfo.count <= 0) {
        delete group[cardName];
      }
      if (updateField) {
        this.fields.set(which, this.cardGroupHtml(which));
      }
    };

    // Return HTML string to display the give card group.
    player.cardGroupHtml = function(which, sort) {
      sort = sort != undefined ? sort : false;
      var group = this[which];
      var html = '';
      var keys = [];
      for (var key in group) {
        keys.push(key);
      }
      if (sort) {
        keys.sort();
      }
      for (var i = 0; i < keys.length; i++) {
        var name = keys[i];
        if (html.length > 0) {
          html += ", ";
        }
        var cardInfo = group[name];
        if (cardInfo.count == 1) {
          html += cardInfo.html;
        } else {
          var card = cardInfo.card;
          var cardElemHtml = cardInfo.html;
          if (card.Singular != card.Plural) {
            // we use the '>' because we don't want to change the cardname attr.
            cardElemHtml =
                cardElemHtml.replace('>' + card.Singular, '>' + card.Plural);
          }
          html += cardInfo.count + '&nbsp;' + cardElemHtml;
        }
      }
      return html;
    };

    player.clearCardGroup = function(which) {
      this[which] = {};
      this.fields.set(which, this.cardGroupHtml(which));
    };

    player.cardCountString = function(cardName) {
      var count = this.card_counts[cardName];
      if (count == undefined || count == 0) {
        return '-';
      }

      var aside = this.cards_aside[cardName];
      if (aside == undefined || aside == 0) {
        return count + "";
      } else {
        return count + '(' + aside + '<span class="asideCountNum">i</span>)';
      }
    };

    player.setResigned = function() {
      // In addition to other classes, this is now in the "resigned" class.
      $("." + player.classFor).addClass("resigned");
      player.classFor += " resigned";
    };

    rewriteTree(function() {
      var ptab = $('#playerDataTable')[0];
      var row1 = addRow(ptab, player.classFor,
          activeDataColumn(player) + '<td id="' + player.idFor('mark') +
              '" class="rowStretch markPlace"></td>' + '<td id="' +
              player.idFor('name') + '" class="playerDataName" rowspan="0">' +
              originalName(player.name) + '</td>');
      row1.attr('id', player.idFor('firstRow'));

      var stetchCells = row1.children('.rowStretch');
      var playerCell = row1.children('#' + player.idFor('name'));
      if (player.icon != undefined) {
        playerCell.children().first().before(player.icon.cloneNode(true))
      }
      var seenWide = undefined;
      var firstWide = 'otherCards';
      var prev;
      var fieldInsertPos = function(field) {
        if (field.name == firstWide) {
          seenWide = $.inArray(field.name, fields.order);
        }

        var keyCell = $('<td/>').append(field.keyNode);
        var valCell = $('<td/>').append(field.valueNode);
        var cells = keyCell.add(valCell);

        if (!player.seenFirst) {
          player.seenFirst = true;
          return {toInsert: cells, after: $('#' + player.idFor('name'))};
        }

        function incrementRowspan(cell) {
          var curSpan = cell.attr('rowspan');
          if (!curSpan) {
            curSpan = '1';
          }
          cell.attr('rowspan', parseInt(curSpan) + 1);
        }

        stetchCells.each(function() {
          incrementRowspan($(this));
        });

        var row = $('<tr/>').addClass(player.classFor);
        if (!seenWide || $.inArray(field.name, fields.order) < seenWide) {
          incrementRowspan(playerCell);
          row.append(cells);
        } else {
          var cell = $('<td/>').attr('colspan', 3).addClass('playerOtherCards');
          row.append(cell);
          cell.append(field.keyNode);
          field.keyNode.after(field.valueNode);
        }

        var after = (prev ? prev : $('#' + player.idFor('firstRow')));
        prev = row;
        return {toInsert: row, after: after};
      };

      var fields = new FieldGroup({idSource: player, tag: 'span',
        findInsert: fieldInsertPos,
        keyClass: 'playerDataKey', valueClass: 'playerDataValue',
        ignoreUnknown: player.isTable});
      player.fields = fields;

      if (player.isTable) {
        fields.add('tradeRoute', {label: "Trade Route", prefix: '$',
          initial: 0, visible: false });
        fields.add('deck', {label: "Trash", initial: player.getDeckString()});
      } else {
        fields.add('score',
            {initial: player.getScore(), valueClass: 'scoreValue'});
        fields.add('deck', {initial: player.getDeckString()});
        fields.add('pirateShipTokens', {label: 'Pirate Ship', prefix: '$',
          initial: 0, isVisible: fieldInvisibleIfZero});
      }
      fields.add('otherCards',
          {label: player.isTable ? 'Other Trash' : 'Other Cards',
            initial: player.cardGroupHtml('otherCard'),
            isVisible: fieldInvisibleIfEmpty});
      if (!player.isTable) {
        // Native Village for "You" lists cards; for others it's just a count.
        var initialNV = 0;
        var visibleNV = fieldInvisibleIfZero;
        if (player.name == "You") {
          initialNV = player.cardGroupHtml('nativeVillage');
          visibleNV = fieldInvisibleIfEmpty;
        }
        fields.add('nativeVillage', {
          label: "Native Village", initial: initialNV, isVisible: visibleNV});
        fields.add('durations', {
          initial: player.cardGroupHtml('durations'),
          isVisible: fieldInvisibleIfEmpty});
      }
    });

    player.get = function(field) {
      return this.fields.get(field);
    };

    player.set = function(field, value) {
      rewriteTree(function () {
        player.fields.set(field, value);
      });
    };

    player.add = function(name, params) {
      rewriteTree(function() {
        player.fields.add(name, params);
      });
    };

    player.change = function(name, params) {
      rewriteTree(function() {
        player.fields.change(name, params);
      });
    };

    player.changeField = function(field, delta) {
      var before = this.get(field);
      var after = before + delta;
      if (before != after) {
        logDebug('infoData',
            this.name + ": change " + field + ": " + before + " ? " + after);
        this.set(field, after);
      }
    };

    player.countString = function() {
      this.deckCards = {};
      var scratchElem = $('<span/>');
      for (var cardName in this.card_counts) {
        var count = this.card_counts[cardName];
        scratchElem.text(cardName);
        this.addToCardGroup('deckCards', scratchElem, count, false);
      }

      var str = htmlToText(this.cardGroupHtml('deckCards', true));
      if (str.length == 0) str = "none";
      var myName = this.isTable ? "Trash" : this.name;
      return myName + ': ' + str;
    };

    player.infoString = function() {
      return this.name + ': ' + this.fields.toString();
    };

    activeDataSetupPlayer(this);
  };

  this.set = function(player, name, value) {
    return player.set(name, value);
  };

  this.recordCard = function(player, cardName) {
    player.updateCardDisplay(cardName);
  };

  this.gainCard = function(player, card, count, trashing) {
    maybeWatchTradeRoute();

    card = $(card);
    var cardName = getSingularCardName(card.text());
    if (!supplied_cards[cardName]) {
      player.addToCardGroup('otherCards', cardName, count);
    }

    if (trashing || player.isTable) {
      view.updateDeck(player);
    }
  };

  this.maybeHandleFirstTurn = function() {
    if (seen_first_turn) return;

    seen_first_turn = true;

    // It may be hidden during veto.
    $('#playerDataTable').show();

    maybeWatchTradeRoute();

    activeDataHandleFirstTurn();
  };

  this.beforeTurn = function() {
    this.maybeHandleFirstTurn();
    // End the previous turn.
    activeDataEndTurn();
  };

  this.startTurn = function(node) {
    markCurrentPlayer();
    activeDataStartTurn();

    // The start of the turn is styled to match the player's data area.
    $(node).addClass(last_player.classFor);

    // If we don't know the icon, look it up from this turn start.
    if (last_player.icon == undefined) {
      var imgs = node.getElementsByTagName("img");
      if (imgs.length > 0)
        last_player.setIcon(imgs[0]);
    }

  };

  this.updateScores = function() {
    if (last_player == null) return;
    maybeSetupCardCounts();
    rewriteTree(function() {
      allPlayers(function(player) {
        player.updateScore();
      });
    });
  };

  this.updateDeck = function(player) {
    player = player || last_player;
    if (player == null) return;
    rewriteTree(function() {
      player.updateDeck();
    });
  };

  // Return the string used for DOM ID's for a given (card) name -- we
  // canonicalize it to be always lower case, stripping out non-letters.
  function toIdString(name) {
    return name.replace(/[^a-zA-Z]/gi, "").toLowerCase();
  }

  // Set up the player area in which per-player info will be displayed.
  function setupPlayerArea() {
    if ($('#playerDataTable').length > 0) {
      return;
    }

    var ptab = $('<table/>');
    if (!text_mode) {
      ptab.attr('align', 'right');
    }
    ptab.attr('id', 'playerDataTable');

    if (text_mode) {
      var outerTable = $('<table/>');
      outerTable.attr('id', 'playerDataArranger');
      var row = addRow(outerTable, null,
          '<td id="playerDataContainer" valign="bottom"></td>' +
              '<td id="logContainer" valign="bottom"></td>');
      var kids = row.children();
      kids.first().append(ptab);
      kids.last().append($('#log'), $('#full_log'), $('#choices'));
      $('#game > :first-child').before(outerTable);
    } else {
      var player_spot = $('#supply');
      rewriteTree(function () {
        var outerCell = $('<td valign="bottom"/>');
        $(player_spot).replaceWith(outerCell);
        outerCell.append(ptab);
        outerCell.append(player_spot);
      });
    }
    // Start out hidden until the first turn, so if veto mode is going on, we
    // aren't showing the in-play data area.
    ptab.hide();
  }

  // As needed, set per-card count columns.
  function maybeSetupCardCounts() {
    rewriteTree(function () {
      if (text_mode) {
        setupPerPlayerTextCardCounts();
      } else {
        setupPerPlayerImageCardCounts('kingdom');
        setupPerPlayerImageCardCounts('basic');
      }
      updateCardCountVisibility();
    });
  }

  // Set up player data area and the per-card count columns.
  function setupPerPlayerInfoArea() {
    if (disabled) return;

    //!! Show how far through the deck each player is
    //!! Include sub-score areas for each 'extra' type (Duke, Fairgrounds, ...)
    //!! Show how much each 'extra' type would be worth (Duke, Fairgrounds, ...)
    rewriteTree(function () {
      setupPlayerArea();
      markCurrentPlayer();
    });
  }

  function markCurrentPlayer() {
    if (disabled) return;
    if (last_player == null) return;

    // Even if we're not tracking active player data, we mark the current player
    $('.activeMark').removeClass('activeMark');
    $('#' + last_player.idFor('mark')).addClass('activeMark');

    activeDataPlace();
  }

  // Remove the card counts columns
  function removeCardCounts() {
    $(".playerCardCountCol").remove();
  }

  // Remove the player area, such as at the end of the game or if disabled.
  function removePlayerArea() {
    var ptab = document.getElementById("playerData");
    if (!ptab) {
      // If there is no overall 'playerData' item, then it's just the table
      ptab = document.getElementById('playerDataTable');
    }
    if (ptab != null && ptab.parentNode != null) {
      activeDataStop();
      ptab.parentNode.removeChild(ptab);
    }
    removeCardCounts();
    ungrowHeaderColumns();
  }

  this.gainPirateShipToken = function(player, count) {
    count = count == undefined ? 1 : count;
    player.changeField('pirateShipTokens', count);
  };

  this.toNativeVillage = function(player, spec) {
    if (typeof(spec) == 'number') {
      player.changeField('nativeVillage', 1);
    } else {
      player.addToCardGroup('nativeVillage', spec);
    }
  };

  this.clearNativeVillage = function(player) {
    if (typeof(player.get('nativeVillage')) == 'number') {
      player.changeField('nativeVIllage', 0);
    } else {
      player.clearCardGroup('nativeVillage');
    }
  };

  this.handleLog = function(elems, nodeText) {
    activeDataHandleCounts(elems, nodeText)
  };

  // Add a row to a table.
  function addRow(tab, rowClass, innerHTML) {
    var r = $('<tr/>');
    if (rowClass)
      r.addClass(rowClass);
    $(tab).append(r);
    r.html(innerHTML);
    return r;
  }

  // Set up the card count cell for a given player+card combination in text mode.
  function setupCardCountCellForPlayer(player, cardName) {
    var cellId = player.idFor(cardName);
    if (!document.getElementById(cellId)) {
      return $('<td id="' + cellId + '">' + player.cardCountString(cardName) +
          '</td>').addClass("playerCardCountCol").addClass(player.classFor);
    } else {
      return null;
    }
  }

  // Any row that spans a number of columns should span the added columns.
  // Use the attribute "grown" to avoid adjusting the same thing multiple times.
  function growHeaderColumns() {
    var toAdd = player_count + 1; // the extra is for the trash player

    $("#supply > table > tbody > tr > td[colspan]:not([grown])")
        .each(function() {
          var $this = $(this);
          var origSpanStr = $this.attr('colspan');
          var origSpan = parseInt(origSpanStr);
          $this.attr('colspan', (origSpan + toAdd));
          $this.attr('grown', toAdd);
        });
  }

  function ungrowHeaderColumns() {
    $('#supply td[grown]').each(function() {
      var $this = $(this);
      var grownBy = $this.attr('grown');
      var colspan = $this.attr('colspan');
      $this.attr('colspan', (parseInt(colspan) - parseInt(grownBy)));
      $this.removeAttr('grown');
    });
  }

  // Set up the card count cells for all players (including the trash player) in
  // text mode.
  function setupPerPlayerTextCardCounts() {
    // For each row in the supply table, add a column count cell for each player.
    $(".txcardname").each(function() {
      var $this = $(this);
      var cardName = $this.children("[cardname]").first().attr('cardname');
      // Insert new cells after this one.
      var insertAfter = $this.next();
      allPlayers(function(player) {
        var cell = setupCardCountCellForPlayer(player, cardName);
        if (cell != null) {
          insertAfter.after(cell);
          insertAfter = cell;
        }
      });
    });
    growHeaderColumns();
  }

  // Set up the per-player card counts in image mode for a given column.
  function setupPerPlayerImageCardCounts(region) {
    var selector = '.' + region + '-column';

    // make "hr" rows span all columns
    var numPlayers = 1 + player_count + 1;
    $(selector + ' .hr:empty').append('<td colspan="' + numPlayers + '"></td>');

    $(selector + ' .supplycard').each(function() {
      var $this = $(this);
      var cardName = $this.attr('cardname');
      allPlayers(function(player) {
        var cell = setupCardCountCellForPlayer(player, cardName);
        if (cell != null)
          $this.append(cell);
      });
    });
  }

  // Drop any state related to knowing text vs. image mode.
  function forgetGUIMode() {
    document.firstChild.id = "";
    $("#body").removeClass("textMode").removeClass("imageMode")
        .removeClass("playing");
  }

  function maybeWatchTradeRoute() {
    if (!tablePlayer) return;

    var stars = $('#supply').find('span.trade-route-star');
    rewriteTree(function () {
      if (stars.length > 0 && !maxTradeRoute) {
        maxTradeRoute = stars.length;
        tablePlayer.change('tradeRoute',
            {suffix: '/' + maxTradeRoute, visible: true});
      }
      if (maxTradeRoute) {
        tablePlayer.set('tradeRoute', maxTradeRoute - stars.length);
      }
    });
  }

  this.updateCardCountVisibility = function() {
    var countCols = $('.playerCardCountCol');
    if (optionButtons['show_card_counts'].attr('checked')) {
      growHeaderColumns();
      countCols.show();
    } else {
      ungrowHeaderColumns();
      countCols.hide();
    }
  };

  this.hide = function() {
    this.stop();
    removePlayerData();
    $('#optionPanelHolder').hide();
    $('div[reinserted="true"]').css('display', 'none');
  };

  this.remove = function() {
    removePlayerArea();
    forgetGUIMode();
    $('#playerDataArranger').remove();
  };

  this.stop = function() {
    text_mode = undefined;
    activeDataStop();
  };

  this.handle = function(doc) {
    activeDataStartHandle(doc);

    if (!started) {
      // This is sometimes left around
      if (document.getElementById("playerDataTable") && inLobby()) {
        removePlayerData();
        $("#copied_temp_say").remove();
      }
      return;
    }

    if (doc.parentNode.id == "supply" && tablePlayer) {
      maybeWatchTradeRoute();
    }
  };

  this.enterLobby = function() {
  };

  activeDataInitialize();
  setupPerPlayerInfoArea();
}