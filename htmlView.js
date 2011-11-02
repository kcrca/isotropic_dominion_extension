(function() {
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

function CardGroup(name, params) {
  this.name = name;
  this.showCount = false;
  this.sort = false;
  if (params) $.extend(this, params);

  var members = {};

  // Add a card to a group of cards. 
  this.add = function(cards, count) {
    count = (count == undefined ? 1 : count);
    $(cards).each(function() {
      var cardElem = $(this);
      var cardName = getSingularCardName(cardElem.text());
      var cardInfo = members[cardName];
      if (!cardInfo) {
        cardInfo = members[cardName] = {
          count : 0,
          card: card_map[cardName]
        };
        // Adding in the 'cardname' attribute means that hovering over the
        // card will pop up the tooltip window about the card.
        if (!cardElem.attr('cardname')) {
          // Get a copy so we can modify it and not change the original.
          cards = cardElem.clone();
          cardElem.attr('cardname', cardName);
        }
        cardInfo.html = cardElem[0].outerHTML;
      }
      cardInfo.count += count;
      if (cardInfo.count <= 0) {
        delete this[cardName];
      }
    });
  };

  this.remove = function(cardName) {
    cardName = getSingularCardName(cardName);
    if (members[cardName]) {
      delete members[cardName];
      return true;
    }
    return false;
  };

  this.clear = function() {
    members = {};
  };

  this.count = function(cardName) {
    if (cardName) {
      var namedInfo = members[cardName];
      return (namedInfo ? namedInfo.count : undefined);
    }

    var count = 0;
    for (cardName in members) {
      var cardInfo = members[cardName];
      count += cardInfo.count;
    }
    return count;
  };

  this.html = function(params) {
    params = $.extend({sort: false, showCount: false}, params);
    var keys = [];
    for (var key in members) {
      keys.push(key);
    }
    if (keys.length == 0) {
      return '';
    }
    if (params.sort) {
      keys.sort();
    }
    var total = 0;
    var cards = [];
    var html;
    for (var i = 0; i < keys.length; i++) {
      var name = keys[i];
      var info = members[name];
      total += info.count;
      html = info.html;
      if (info.count == 1) {
        if (this.showCount) html = 1 + '&nbsp;' + html;
      } else {
        var card = info.card;
        if (card.Singular != card.Plural) {
          // Include the '>' so we don't change the cardname attr.
          html = html.replace('>' + card.Singular, '>' + card.Plural);
        }
        html = info.count + '&nbsp;' + html;
      }
      cards.push(html);
    }
    html = cards.join(', ');
    if (this.showCount) {
      html = total + '&nbsp;card' + (total == 1 ? '' : 's') + ': ' + html;
    }
    return html;
  }
}

function HtmlView() {
  var maxTradeRoute = undefined;
  var seen_first_turn = false;
  var activeData = new ActiveData(this);
  var groups = {};

  // Are we in text mode (vs. image mode) in the UI?
  var text_mode;

  var splitOutIslands = false;

  // How many different player CSS classes are supported?
  //noinspection LocalVariableNamingConventionJS
  var PLAYER_CLASS_COUNT = 4;

  this.tests = { handSize: true };

  this.setupPlayer = function(player) {
    player.icon = undefined;
    player.cards_aside = {};

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

    player.createCardGroup = function(which, params) {
      groups[which] = new CardGroup(which, params);
    };

    player.cardGroup = function(which) {
      var group = groups[which];
      if (!group) group = groups[which] = new CardGroup(which);
      return group;
    };

    player.addToCardGroup = function(which, cards, count) {
      var group = this.cardGroup(which);
      group.add(cards, count);
      player.fields.set(which, group.html());
    };

    player.removeFromCardGroup = function(which, cardName) {
      var group = this.cardGroup(which);
      group.remove(cardName);
      player.fields.set(which, group.html());
    };

    // Return HTML string to display the give card group.
    player.cardGroupHtml = function(which) {
      return this.cardGroup(which).html();
    };

    player.clearCardGroup = function(which) {
      var group = this.cardGroup(which);
      group.clear();
      this.fields.set(which, group.html(which));
    };

    player.cardCountString = function(cardName) {
      var count = this.card_counts[cardName];
      if (count == undefined || count == 0) {
        return '-';
      }

      if (!splitOutIslands) {
        return count + "";
      } else {
        var onIsland = this.cardGroup('island').count(cardName);
        if (onIsland == undefined || onIsland == 0) {
          return count + "";
        } else {
          return count + '(' + onIsland +
              '<span class="islandCountNum">i</span>)';
        }
      }
    };

    player.setResigned = function() {
      // In addition to other classes, this is now in the "resigned" class.
      $("." + player.classFor).addClass("resigned");
      player.classFor += " resigned";
    };

    player.createCardGroup('island', {showCount: true});

    rewriteTree(function() {
      var ptab = $('#playerDataTable')[0];
      var row1 = addRow(ptab, player.classFor,
          activeData.column(player) + '<td id="' + player.idFor('mark') +
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
        fields.add('island', {
          label: 'Island Mat',
          initial: player.cardGroupHtml('island'),
          isVisible: fieldInvisibleIfEmpty});
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
      var deckCards = new CardGroup('deckCards', {sort: true});
      var scratchElem = $('<span/>');
      for (var cardName in this.card_counts) {
        var count = this.card_counts[cardName];
        scratchElem.text(cardName);
        deckCards.add(scratchElem, count);
      }

      var str = deckCards.html();
      if (str.length == 0) str = "none";
      var myName = this.isTable ? "Trash" : this.name;
      return myName + ': ' + str;
    };

    player.infoString = function() {
      var name = (this.name.length > 0 ? this.name : "Trash");
      return name + ': ' + this.fields.toString();
    };

    player.setAside = function(elems) {
      this.addToCardGroup('island', elems);
    };

    player.islandMatCount = function(cardName) {
      return this.cardGroup('island').count(cardName);
    };
  };

  this.set = function(player, name, value) {
    return player.set(name, value);
  };

  this.suppliedCardsKnown = function() {
    // Sometimes on reload this isn't known until after the log is reloaded, in
    // which case we have to remove all the cards that were thought of as
    // "Other cards" before we knew what the supplied cards were.
    allPlayers(function(player) {
      for (var cardName in supplied_cards) {
        player.removeFromCardGroup('otherCards', cardName);
      }
    });
  };

  this.recordCard = function(player, cardName) {
    player.updateCardDisplay(cardName);
  };

  this.gainCard = function(player, card, count, trashing) {
    maybeWatchTradeRoute();

    card = $(card);
    var cardName = getSingularCardName(card.text());
    if (!supplied_cards[cardName]) {
      player.addToCardGroup('otherCards', card, count);
    }

    if (trashing || player.isTable) {
      view.updateDeck(player);
    }
  };

  this.buy = function(count, card_text) {
    var card_obj = card_map[card_text];
    activeData.cardBought(count, card_obj);
  };

  this.maybeHandleFirstTurn = function() {
    if (seen_first_turn) return;

    seen_first_turn = true;

    // It may be hidden during veto.
    $('#playerDataTable').show();

    maybeWatchTradeRoute();

    activeData.handleFirstTurn();
  };

  this.beforeTurn = function() {
    this.maybeHandleFirstTurn();
    // End the previous turn.
    activeData.endTurn();
  };

  this.startTurn = function(node) {
    markCurrentPlayer();
    activeData.startTurn();

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
      view.updateCardCountVisibility();
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

    activeData.place();
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
      activeData.stop();
      ptab.parentNode.removeChild(ptab);
    }
    removeCardCounts();
    ungrowHeaderColumns();
  }

  //noinspection JSUnusedLocalSymbols
  function maybeGainPirateShipToken(elems, text, nodeText) {
    if (nodeText.indexOf("a Pirate Ship token") != -1) {
      var player = getPlayer(text[0]);
      player.changeField('pirateShipTokens', 1);
    }
  }

  function toNativeVillage(player, spec) {
    var field = player.fields.field('nativeVillage');
    if (typeof(spec) == 'number') {
      if (!field) {
        player.fields.set('nativeVillage', 0);
      }
      field.change({suffix: ' cards'});
      player.changeField('nativeVillage', 1);
      if (field.get() == 1) {
        field.change({suffix: ' card'});
      }
    } else {
      if (field) field.change({suffix: undefined});
      player.addToCardGroup('nativeVillage', spec);
    }
  }

  function clearNativeVillage(player) {
    if (typeof(player.get('nativeVillage')) == 'number') {
      player.set('nativeVillage', 0);
    } else {
      player.clearCardGroup('nativeVillage');
    }
  }

  this.handleLog = function(elems, text, nodeText) {
    activeData.handleLog(elems, text, nodeText);
    maybeGainPirateShipToken(elems, text, nodeText) ||
        maybeHandleIsland(elems, text, nodeText) ||
        maybeHandleToNativeVillage(elems, text, nodeText) ||
    maybeHandleFromNativeVillage(elems, text, nodeText);
  };

  function maybeHandleIsland(elems, text_arr, text) {
    var lastPlayed = topScope();
    if (lastPlayed == "Island" && text.match(/ set(ting|s)? aside /)) {
      var player = getPlayer(text_arr[0]);
      if (player == null)
        player = last_player;
      player.addToCardGroup('island', elems);
      player.updateCardDisplay('Island');
      $(elems).each(function() {
        player.updateCardDisplay($(this).text());
      });
      return true;
    }
    return false;
  }

  //noinspection JSUnusedLocalSymbols
  function maybeHandleToNativeVillage(elems, text_arr, text) {
    var m = text.match(/ (to|on) the Native Village mat\./);
    if (m) {
      if (elems.length == 2) {
        toNativeVillage(last_player, $(elems[0]));
      } else if (!text.match(/ drawing nothing /)) {
        toNativeVillage(last_player, 1);
      }
      return true;
    }
    return false;
  }

  //noinspection JSUnusedLocalSymbols
  function maybeHandleFromNativeVillage(elems, text_arr, text) {
    if (text.match(/ pick(s|ing) up .+ from the Native Village mat/) ||
        text.match(/ puts? the mat contents into (.+) hand\./)) {
      clearNativeVillage(last_player);
      return true;
    }
    return false;
  }

  this.handleLogDone = function() {
    if (started) activeData.maybeRunTests();
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

  this.updateShowActiveData = function() {
    activeData.updateVisibility();
  };

  this.hide = function() {
    this.stop();
    removePlayerData();
    $('div[reinserted="true"]').css('display', 'none');
  };

  // Discover whether we are in text mode or image mode. The primary bit of state
  // that this sets is for the benefit of CSS: If we are in text mode, body tag
  // has the "textMode" class, otherwise it has the "imageMode" class. In both
  // cases it has the "playing" class, which allows CSS to tell the difference
  // between being in the lobby vs. playing an actual game.
  function discoverGUIMode() {
    if (inLobby()) return;

    $('#chat ~ a[href^="/mode/"]').each(function() {
      // The link is to the "text" mode when it's in image mode and vice versa.
      text_mode = $(this).text().indexOf("text") < 0;
    });

    // Setting the class enables css selectors that distinguish between the modes.
    $("#body").addClass("playing").addClass(
        text_mode ? "textMode" : "imageMode");
  }

  this.inTextMode = function() {
    return text_mode;
  };

// Drop any state related to knowing text vs. image mode.
  function forgetGUIMode() {
    document.firstChild.id = "";
    $("#body").removeClass("textMode").removeClass("imageMode")
        .removeClass("playing");
  }

  this.remove = function() {
    forgetGUIMode();
    removePlayerArea();
    $('#playerDataArranger').remove();
  };

  this.stop = function() {
    activeData.stop();
  };

  this.handle = function(doc) {
    activeData.startHandle(doc);

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

  this.addChatCommands = function() {
    activeData.addChatCommands();
    chatCommands.counts = {
      help:  "see card counts",
      execute: function(writeStatus) {
        allPlayers(function(player) {
          writeStatus(player.countString());
        });
      }
    };
    chatCommands.info = {
      help: "see per-player info",
      execute: function(writeStatus) {
        allPlayers(function(player) {
          writeStatus(player.infoString());
        });
      }
    };
  };

  discoverGUIMode();
  setupPerPlayerInfoArea();
}
