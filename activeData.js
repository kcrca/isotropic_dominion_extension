// Object for active player's data.
var activeData;

var last_card;

var tracking_active_data = true;

// id for testing active values
var activeValueTiemout;

// Used for debugging how long we should set activeValueTimeout
var lastTime;

activeDataSetupCards();

function activeDataColumn(player) {
  return '<td id="' + player.idFor('active') +
      '" class="activePlayerData rowStretch"></td>';
}

function activeDataUpdateVisibility() {
  tracking_active_data = optionButtons['show_active_data'].attr('checked');
  var activePlayerData = $('.activePlayerData');
  if (tracking_active_data) {
    activePlayerData.show();
  } else {
    activePlayerData.hide();
  }
}

isCopperValueVisible = function(field) {
  return field.get() != 1;
};

isNotZero = function(field) {
  return field.get() != 0;
};

// This object holds on to the active data for a single player.
function ActiveData() {
  // This alias is used in nested functions that execute in other contexts
  var dataTable = $('<table id="activePlayerDataTable"/>');
  this.fields = new FieldGroup({idPrefix: 'active', under: dataTable,
    wrapper: fieldWrapInRow,
    keyClass: 'playerDataKey',
    valueClass: 'playerDataValue',
    visibleAt: Field.visible_at_inserted
  });
  var fields = this.fields;

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

  this.lastPlayed = undefined;

  // The default value of each field is held was set above, so remember them.
  this.defaultValues = fields.values();

  // Reset all fields to their default values.
  this.reset = function() {
    for (var f in this.defaultValues) {
      fields.set(f, this.defaultValues[f]);
    }
    this.lastPlayed = undefined;
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

  this.getValues = function() {
    return fields.values();
  };

  // Change the value of a specific field.
  this.changeField = function(field, delta) {
    var before = fields.get(field);
    var after = before + delta;
    if (after != before) {
      logDebug('actiData',
          "Active: change " + field + ": " + before + " → " + after);
      fields.set(field, after);
    }
  };

  this.setUsesPotions = function(usesPotions) {
    fields.setVisible('potions', usesPotions);
  };

  // Account for those effects of playing a specific card that are not
  // explicitly echoed in the interface. For example, playing a card that gives
  // +1 action is not handled here because the interface reports that there
  // has been +1 action, but the coins from a treasure are not separately
  // reported, so we handle it here.
  this.cardHasBeenPlayed =
      function(countIndicator, cardName, userAction, isAgain) {
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
          alert("Unknown card in cardHasBeenPlayed(): " + cardName);
          return;
        }

        this.lastPlayed = card;

        // Change 'played' field first because the values of some cards rely on it.
        var scope = findScope(1);
        if ((scope == "King's Court" || scope == "Throne Room") && isAgain) {
          // In this case it's the same card played again, not a new card played.
        } else {
          this.changeField('played', count);
        }
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

//noinspection JSUnusedLocalSymbols
function activeDataSetupPlayer(player) {

}

function activeDataSetupCards() {
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
          $(this).prev().each(setCost);
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
  patchCardBug('Fortune Teller', 'Action', '1');
  // With Trusty Steed, it lists all *possible* outcomes as *actual*
  patchCardBug('Trusty Steed', 'Actions', '0');
  patchCardBug('Trusty Steed', 'Treasure', '0');
  patchCardBug('Trusty Steed', 'Cards', '0');
}

function activeDataStartHandle(doc) {
  if (debug['activeTime']) {
    var where = $(doc).closest('#log, #temp_say, #choices');
    if (where.length > 0) {
      var elapsed = 0;
      var now = new Date().getTime();
      if (lastTime) {
        elapsed = now - lastTime;
      }
      console.log("...... %5s %6d %s\n", where.attr('id'), elapsed,
          doc.innerText);
      lastTime = now;
    }
  }
}

function activeDataMaybeRunTests() {
  activeDataTestSanity();
  // Many tests will fail if the user is waiting for another player to act, or
  // if the user is being prompted for a choice. When the log entry is added, we
  // can't know whether this is *about* to happen, so we have a timeout: If some
  // time has passed and a 'waiting' message or choice prompt have *not*
  // appeared, it's probably OK to test.
  if (last_player && last_player.name == 'You') {
    activeValueTiemout = window.setTimeout(activeDataLiveTests, 100);
  }
}

function activeDataSetupTests() {
  // See activeDataMaybeRunTests().
  window.clearTimeout(activeValueTiemout);
}

function runActiveDataTests() {
  return last_player != null && started && tracking_active_data &&
      !rewritingTree;
}

function activeDataLiveTests() {
  if (runActiveDataTests()) {
    activeDataTestValuesVsYou();
  }
}

function activeDataTestSanity() {
  if (!runActiveDataTests()) return;
  logDebug('actiData', last_player.name + ": " + activeData.fields);
  var values = activeData.getValues();
  var negatives = [];
  for (var name in values) {
    if (values[name] < 0) {
      negatives.push(name);
    }
  }
  if (negatives.length > 0) {
    alert("Negative values in active data: " + negatives.join(", "));
  } else {
    logDebug('actiData', "sanity checks passed for " + last_player.name);
  }
}

function incompleteUpdate() {
  var tempText = $('#temp_say').text();
  return tempText.indexOf('— waiting ') >= 0 ||
      $('#choices').children().length > 0;

}

function activeDataTestValuesVsYou() {
  if (!last_player || last_player.name != 'You') return;

  // When we're being told we're waiting for something, or being offered a
  // choice, sometimes we are ahead of the game's updates.
  if (incompleteUpdate()) return;

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
  logDebug('actiData', stateMsg);

  var foundProblems = msgs.length != 0;
  if (debug['actiData'] && foundProblems) {
    for (var i = 0; i < msgs.length; i++) {
      logDebug('actiData', '  ' + msgs[i]);
    }
    if (debug['actiData']) alert('Invalid active state: check console');
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
    activeDataUpdateVisibility();
  });
}

// Remove the active player data from the page.
function removeActivePlayerData() {
  activeData.top().remove();
}

function activeDataStartTurn() {
  activeData.reset();
  last_player.clearCardGroup('durations');
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
//    activeDataLiveTests();
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
}

function activeDataHandleFirstTurn() {
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
  var match;
  if ((match = text.match(/ play(?:s?|ing) (.*)/)) &&
      !text.match(/ play area/)) {
    var parts = match[1].split(/,|,?\s+and\b/);
    var elemNum = 0;
    for (var i = 0; i < parts.length; i++) {
      match = /\b(an?|the|[0-9]+) (.*)/.exec(parts[i]);
      if (match == null) continue;
      var cardElem = $(elems[elemNum++]);
      var cardName = cardElem.text();
      var card = card_map[cardName];
      var userAction = !text.match(/^\.\.\. /);
      var isAgain = text.match(/ (again|a ([^ ]*) time)\.$/);
      activeData.cardHasBeenPlayed(match[1], cardName, userAction, isAgain);
      if (card.isDuration()) {
        last_player.addToCardGroup('durations', cardElem, 1);
      }
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
  if (!activeData || !activeData.lastPlayed) return false;
  var lastPlayed = activeData.lastPlayed.Singular;
  if (lastPlayed == "Island" && text.match(/ set(ting|s)? aside /)) {
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
  var match = text.match(/ Copper (?:is now )?worth \$([0-9]+)/);
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
  return findScope(1) != "Black Market";
}

function activeDataCardBought(count, card) {
  if (isNormalBuy()) {
    activeData.changeField('buys', -count);
  }
  activeData.changeField('coins', -(count * card.getCurrentCoinCost()));
  activeData.changeField('potions', -(count * card.getCurrentPotionCost()));
}
