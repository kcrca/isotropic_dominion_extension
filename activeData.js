// Object for active player's data.
var activeData;

var last_card;

var tracking_active_data = true;

// id for testing active values
var activeValueTiemout;

var infoIsForTests = false;

setupCards();

function activeDataOption() {
  var trackOption = $('<input id="activeDataOption" type="checkbox"/>');
  trackOption.attr('checked', tracking_active_data);
  trackOption.change(function() {
    tracking_active_data = trackOption.attr('checked');
    var activePlayerData = $('.activePlayerData');
    if (tracking_active_data) {
      activePlayerData.show();
    } else {
      activePlayerData.hide();
    }
    debug['activeData'] = tracking_active_data;
  });
  $('#playerDataTable').each(function() {
    $(this).before(trackOption);
    trackOption.after($('<label for="activeDataOption"/>')
        .text("Track active data"));
  });
  trackOption.change();
}

function removeActiveDataOption() {
  $('#activeDataOption').each(function() {
    $(this).next().remove();
    $(this).remove();
  })
}

// This object holds on to the active data for a single player.
function ActiveData() {
  // This alias is used in nested functions that execute in other contexts
  var dataTable = $('<table id="activePlayerDataTable"/>');
  var fields = new FieldGroup({idPrefix: 'active', under: dataTable,
    wrapper: fieldWrapInRow,
    keyClass: 'playerDataKey',
    valueClass: 'playerDataValue',
    visibleAt: Field.visible_at_inserted
  });

  rewriteTree(function () {
    fields.add('actions', { initial: 1 });
    fields.add('buys', { initial: 1 });
    fields.add('coins', { initial: 0, prefix: '$' });
    fields.add('copper',
        { initial: 1, prefix: '$', isVisible: isCopperValueVisible });
    fields.add('VP', { initial: 0, prefix: '▼', isVisible: isNotZero });
    fields.add('potions', { initial: 0, prefix: '◉' });
    fields.add('played', { initial: 0 });
  });

  // The default value of each field is held was set above, so remember them.
  this.defaultValues = fields.values();

  // Reset all fields to their default values.
  this.reset = function() {
    for (var f in this.defaultValues) {
      fields.set(f, this.defaultValues[f]);
    }
  };

  this.top = function() {
    return dataTable;
  };

  this.get = function(field) {
    return fields.get(field);
  };

  this.set = function(field, value) {
    rewriteTree(function () {
      fields.set(field, value);
    });
  };

  // Change the value of a specific field.
  this.changeField = function(key, delta) {
    fields.set(key, this.get(key) + delta);
  };

  this.setUsesPotions = function(usesPotions) {
    fields.setVisible('potions', usesPotions);
  };

  // Account for those effects of playing a specific card that are not
  // explicitly echoed in the interface. For example, playing a card that gives
  // +1 action is not handled here because the interface reports that there
  // has been +1 action, but the coins from a treasure are not separately
  // reported, so we handle it here.
  this.cardHasBeenPlayed = function(countIndicator, cardName, userAction) {
    // Convert the "count" string to a number; may be digits or "a', "the", etc.
    var count = NaN;
    try {
      count = parseInt(countIndicator);
    } catch (ignored) {
      // a, an, the
      count = 1;
    }
    if (isNaN(count))
      count = 1;

    var card = card_map[cardName];
    if (card == null) {
      alert("Unknown card in playsCard(): " + cardName);
      return;
    }

    // Change 'played' field first because the values of some cards rely on it.
    this.changeField('played', count);
    if (userAction && card.isAction()) {
      // Consume the action for playing an action card.
      this.changeField('actions', -count);
    }
    if (card.isTreasure()) {
      // The gains from treasure cards are not reported.
      var copperMult = (
          card.Singular == 'Copper' ? activeData.get('copper') : 1);
      this.changeField('coins', count * card.getCoinCount() * copperMult);
      this.changeField('potions', count * card.getPotionCount());
      this.changeField('buys', count * card.getBuys());
      this.changeField('actions', count * card.getActions());
    }
  };
}

function setupCards() {
  var cardList = "\n";
  for (var i = 0; i < card_list.length; i++) {
    var card = card_list[i];
    if (i % 10 != 0) cardList += ', ';
    cardList += (card.Singular);
    if (i % 10 == 9 || i == card_list.length - 1) {
      console.log(cardList + "\n");
      cardList = "\n";
    }
    card.isAction = function() {
      return this.Action != "0";
    };
    card.isTreasure = function() {
      return this.Treasure != "0";
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
    card.getCurrentCoinCost = function() {
      // The current cost can be affected by cards in play, such as Quarry, so we
      // have to look up the price in the interface.
      var costStr;
      var setCost = function() {
        costStr = $(this).text();
      };
      var card = this;
      if (text_mode) {
        $('a[cardname="' + this.Singular + '"]').each(function() {
          var price = $(this).closest('tr').find('.price').each(setCost);
        });
      } else {
        $('div.supplycard[cardname="' + this.Singular + '"] .imprice')
            .each(setCost);
      }
      if (costStr) {
        // The string has a leading '$' we need to skip.
        return parseInt(costStr.substr(1));
      }
      return this.getCoinCost();
    };
    card.getCurrentPotionCost = function() {
      // No card affects the potion cost, so we can just use the simple cost.
      return this.getPotionCost();
    };
  }

  // Special handling for some cards.
  card_map['Diadem'].getCoinCount = function() {
    return 2 + activeData.get('actions');
  };

  function patchCardBug(cardName, prop, correctValue) {
    var tableValue = card_map[cardName][prop];
    if (tableValue != correctValue) {
      console.log('Note: patching card_list: changing ' + cardName + '.' +
          prop + ' from ' + tableValue + ' to ' + correctValue);
      card_map[cardName][prop] = correctValue;
    }
  }

  patchCardBug('Horse Traders', 'Action', '1');
  patchCardBug('Hunting Party', 'Action', '1');
  // With Trusty Steed, it lists all *possible* outcomes as *actual*
  patchCardBug('Trusty Steed', 'Actions', '0');
  patchCardBug('Trusty Steed', 'Treasure', '0');
  patchCardBug('Trusty Steed', 'Cards', '0');
}

function activeDataGainCard(player, trashing, card, count) {
  trashing = trashing == undefined ? true : trashing;
  var singular_card_name = getSingularCardName(card.innerText);
  player.changeScore(pointsForCard(singular_card_name) * count);
  player.recordSpecialCards(card, count);
  player.recordCards(singular_card_name, count);
  if (!supplied_cards[singular_card_name]) {
    player.addOtherCard(card, count);
  }

  // If the count is going down, usually player is trashing a card.
  if (!player.isTrash && count < 0 && trashing) {
    trashPlayer.gainCard(card, -count);
  }
  if (trashing || player.isTrash) {
    updateDeck(trashPlayer);
  }
}

function activeDataMaybeRunTests() {
  if (last_player && last_player.name == 'You') {
    console.log("testing in 300 ms\n");
    activeValueTiemout = window.setTimeout(activeDataTestValuesVsYou, 300);
  }
}

function activeDataSetupTests() {
  console.log("clearing the timeout\n");
  window.clearTimeout(activeValueTiemout);
}

function activeDataTestValuesVsYou() {
  if (!tracking_active_data) return;
  if (rewritingTree) return;
  if (!started) return;
  if (!last_player || last_player.name != 'You') return;

  // When we're being told we're waiting for something, or being offered a
  // choice, sometimes we are ahead of the game's updates.
  var tempText = $('#temp_say').text();
  if (tempText.indexOf('— waiting ') >= 0) return;
  if ($('#choices').children().length > 0) return;

  var msgs = [];

  function checkValue(text, name) {
    var shown = parseInt(text);
    var active = activeData.get(name);
    if (shown != active) {
      msgs.push(name + ': ' + shown + ' [shown] != ' + active + ' [active]');
    }
  }

  var activeState = activeData.get('actions') + 'a, ' + activeData.get('buys') +
      'b, $' + activeData.get('coins') + '+' + activeData.get('potions');
  var shownState = '';
  var candidates = $('#hand_holder .hrightfixed1');
  candidates.each(function() {
    var node = $(this);
    var shownLabel = node.text();
    var shownValue = node.next().text();
    if (shownState) shownState += ', ';
    var valueAbbrev = shownLabel.charAt(0);
    switch (shownLabel) {
    case "actions:":
    case "buys:":
      checkValue(shownValue, shownLabel.substr(0, shownLabel.length - 1));
      break;
    case "to spend:":
      valueAbbrev = '';
      var m = shownValue.match(/\$([0-9]+)(\s+◉×?([0-9]+)?)?/);
      if (!m) {
        return;
      }
      checkValue(m[1], 'coins');
      if (m[3]) {
        checkValue(m[3], 'potions');
      } else if (m[2] && m[2].length > 0) {
        checkValue('1', 'potions');
      } else {
        checkValue('0', 'potions');
      }
      break;
    }
    shownState += shownValue + valueAbbrev;
  });
  var stateMsg = (msgs.length == 0 ? 'valid' : 'INVALID') + ' @ ' + new Date() +
      ': ' + shownState + ' [shown] vs. ' + activeState + ' [active]';
  logDebug('activeData', stateMsg);

  var foundProblems = msgs.length != 0;
  if (debug['activeData'] && foundProblems) {
    for (var i = 0; i < msgs.length; i++) {
      logDebug('activeData', '  ' + msgs[i]);
    }
    if (debug['activeData']) alert('Invalid active state: check console');
  }
}

// At the start of each turn, place the active player data display in the
// proper place for the current player.
function activeDataPlace() {
  // Each player has a place for its active data, we just look it up here.
  var playerID = last_player.idFor('active');
  var cell = $('#' + playerID);
  if (cell.length == 0)
    return;

  rewriteTree(function() {
    cell.empty();
    cell.append(activeData.top());
  });
}

// Remove the active player data from the page.
function removeActivePlayerData() {
  activeData.top().remove();
  removeActiveDataOption();
}

function activeDataStartTurn() {
  activeData.reset();
  last_card = undefined;
}

function activeDataEndTurn() {
  // This is currently unused; it used to invoke the active data test one last
  // time on "you" if you were there the current player, but there were times
  // when the shown data (against which the active data is compared) wasn't
  // updated during the turn change (specifically, after the final buy of a
  // multi-buy turn, the number of remaining buys is shown as 1, not 0). So that
  // has been removed, but maybe it should be replaced at some point.

//  // Before we switch to the next player, check the final values
//  if (last_player && last_player.name == "You")
//    activeDataTestValuesVsYou();
}

// Adjust the value of a piece of active player data if there is a specification
// for the number by which to adjust it.
function adjustActive(key, spec) {
  if (spec != null) {
    activeData.changeField(key, parseInt(spec[1]));
  }
}

function activeDataInitialize() {
  activeData = new ActiveData();
  activeData.setUsesPotions(supplied_cards['Potion'] != undefined);
}

function activeDataStop() {
  removeActivePlayerData();
}

// If appropriate, adjust active data values. Return 'true' if there is no
// possibility of other useful data to be handled in this log line.
function activeDataHandleCounts(elems, text) {
  // Handle lines like "You play a Foo", or "You play a Silver and 2 Coppers."
  // But ignore "You trash xyz from your play area" after you buy a Mint.
  if (text.match(/ plays? /) && !text.match(/ play area/)) {
    var parts = text.split(/,|,?\s+and\b/);
    var elemNum = 0;
    for (var i = 0; i < parts.length; i++) {
      var match = /\b(an?|the|[0-9]+) (.*)/.exec(parts[i]);
      if (match == null) continue;
      var cardName = elems[elemNum++].innerText;
      activeData.cardHasBeenPlayed(match[1], cardName, !text.match(/^\.\.\. /));
    }
    return elemNum > 0;
  }

  // Handle lines like "You get +1 buy and +$1."
  adjustActive('actions', /\+([0-9]+) action/.exec(text));
  adjustActive('buys', /\+([0-9]+) buy/.exec(text));
  adjustActive('coins', /\+\$([0-9]+)/.exec(text));
  return false; // the log message may say something else valuable
}

function maybeHandleIsland(elems, text_arr, text) {
  // 'draw and set aside' is a library, not an island
  if (text.match(/draw and sets? aside/)) return false;
  if (text.match(/ set(ting|s)? aside /)) {
    var player = getPlayer(text_arr[0]);
    if (player == null)
      player = last_player;
    player.setAside(elems);
    return true;
  }
  return false;
}

//noinspection JSUnusedLocalSymbols
function maybeHandleCoppersmith(elems, text_arr, text) {
  var match = text.match(/ Copper is now worth \$([0-9]+)/);
  if (match) {
    activeData.set('copper', parseInt(match[1]));
    return true;
  }
  return false;
}

function maybeHandleVp(text) {
  var re = new RegExp("[+]([0-9]+) ▼");
  var arr = text.match(re);
  if (arr && arr.length == 2) {
    last_player.changeScore(arr[1]);
    activeData.changeField('VP', parseInt(arr[1]));
  }
}

function isNormalBuy() {
  return !(scopes.length > 1 && scopes[scopes.length - 2] == "Black Market");
}

function activeDataCardBought(count, card) {
  if (isNormalBuy()) {
    activeData.changeField('buys', -count);
  }
  activeData.changeField('coins', -(count * card.getCurrentCoinCost()));
  activeData.changeField('potions', -(count * card.getCurrentPotionCost()));
  last_card = card;
}
