// For players who have spaces in their names, a map from name to name
// rewritten to have underscores instead. Pretty ugly, but it works.
var player_rewrites = new Object();

// Map from player name to Player object.
var players = new Object();
// Regular expression that is an OR of players other than "You".
var player_re = "";
// Count of the number of players in the game.
var player_count = 0;

// Are we in text mode (vs. image mode) in the UI?
var text_mode;

// psuedo-player for Trash card counts
var trashPlayer;

// Object for active player's data.
var activeData;

// Map that contains the cards in the supply piles; other cards need to be shown
// shown in other ways.
var supplied_cards;

// Places to print number of cards and points.
var deck_spot;
var points_spot;
var player_spot;
var gui_mode_spot;

// How many different player classes are supported?
var PLAYER_CLASS_COUNT = 4;

var started = false;
var introduced = false;
var i_introduced = false;
var disabled = false;
var had_error = false;
var show_action_count = false;
var show_unique_count = false;
var show_duchy_count = false;
var possessed_turn = false;
var announced_error = false;

// Enabled by debugger when analyzing game logs.
var debug_mode = false;

var last_player = null;
var last_reveal_player = null;
var last_reveal_card = null;

// The player's own icon
var my_icon = null;

// Number for generating log line IDs.
var next_log_line_num = 0;

// Last time a status message was printed.
var last_status_print = 0;

// The last player who gained a card.
var last_gain_player = null;

// Track scoping of actions in play such as Watchtower.
var scopes = [];

// The version of the extension currently loaded.
var extension_version = 'Unknown';

// Tree is being rewritten, so should not process any tree change events.
var rewritingTree = 0;

// Quotes a string so it matches literally in a regex.
RegExp.quote = function(str) {
  return str.replace(/([.?*+^$[\]\\(){}-])/g, "\\$1");
};

// Variables for making the tooltips move around less.
var tooltip;
var tooltip_bottom = {};

// Keep a map from all card names (singular or plural) to the card object.
var card_map = {};
for (var i = 0; i < card_list.length; i++) {
  var card_name = card_list[i];
  card_map[card_name.Singular] = card_name;
  card_map[card_name.Plural] = card_name;
  card_name.isAction = function() {
    return this.Action != "0";
  };
  card_name.getCoinCount = function() {
    return (this.Coins == "?" || this.Coins == "P" ? 0 : parseInt(this.Coins));
  };
  card_name.getPotionCount = function() {
    return (this.Coins == "P" ? 1 : 0);
  };
  card_name.getCoinCost = function() {
    var cost = this.Cost;
    cost = (cost.charAt(0) == 'P' ? cost.substr(1) : cost);
    return parseInt(cost);
  };
  card_name.getPotionCost = function() {
    return (this.Cost.indexOf("P") >= 0 ? 1 : 0);
  };
  card_name.getCurrentCoinCost = function() {
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
      $('.cardname > span').each(function() {
        if ($(this).text() == card.Singular) {
          $(this).closest('.supplycard').find('.imprice').each(setCost);
        }
      });
    }
    if (costStr) {
      // The string has a leading '$' we need to skip.
      return parseInt(costStr.substr(1));
    }
    return this.getCoinCost();
  };
  card_name.getCurrentPotionCost = function() {
    // No card affects the potion cost, so we can just use the simple cost.
    return this.getPotionCost();
  };
}

function debugString(thing) {
  return JSON.stringify(thing);
}

function rewriteName(name) {
  return name.replace(/ /g, "_").replace(/'/g, "’").replace(/\./g, "");
}

function handleError(text) {
  console.log(text);
  if (!had_error) {
    had_error = true;
    alert("Point counter error. Results may no longer be accurate: " + text);
  }
}

function getSayButton() {
  var blist = document.getElementsByTagName('button');
  for (var button in blist) {
    if (blist[button].innerText == "Say") {
      return blist[button];
    }
  }
  return null;
}

function writeText(text) {
  // Get the fields we need for being able to write text.
  var input_box = document.getElementById("entry");
  var say_button = getSayButton();

  if (input_box == null || input_box == undefined || !say_button) {
    handleError("Can't write text -- button or input box is unknown.");
    return;
  }
  var old_input_box_value = input_box.value;
  input_box.value = text;
  say_button.click();
  input_box.value = old_input_box_value;
}

function maybeAnnounceFailure(text) {
  if (!disabled && !announced_error) {
    console.log("Logging error: " + text);
    writeText(text);
  }
  announced_error = true;
}

function pointsForCard(card_name) {
  if (card_name == undefined) {
    handleError("Undefined card for points...");
    return 0;
  }
  if (card_name.indexOf("Colony") == 0) return 10;
  if (card_name.indexOf("Province") == 0) return 6;
  if (card_name.indexOf("Duchy") == 0) return 3;
  if (card_name.indexOf("Duchies") == 0) return 3;
  if (card_name.indexOf("Estate") == 0) return 1;
  if (card_name.indexOf("Curse") == 0) return -1;

  if (card_name.indexOf("Island") == 0) return 2;
  if (card_name.indexOf("Nobles") == 0) return 2;
  if (card_name.indexOf("Harem") == 0) return 2;
  if (card_name.indexOf("Great Hall") == 0) return 1;

  return 0;
}

function Player(name, num) {
  this.name = name;
  this.score = 3;
  this.deck_size = 10;
  this.icon = undefined;

  this.isTrash = name == "Trash";

  // The set of "other" cards -- ones that aren't in the supply piles
  this.otherCards = {};

  if (this.isTrash) {
    this.idPrefix = "trash";
  } else {
    this.idPrefix = "player" + num;
  }

  // Return the player-specific name for a general category. This is typically
  // used for DOM node ID but can also be used as a DOM class name.
  this.idFor = function(category) {
    return this.idPrefix + "_" + toIdString(category);
  };

  // Define the general player class used for CSS styling
  if (name == "You") {
    this.classFor = "you";
  } else if (this.isTrash) {
    this.classFor = "trash";
  } else {
    // CSS cycles through PLAYER_CLASS_COUNT display classes
    this.classFor = "playerClass" + ((num - 1) % PLAYER_CLASS_COUNT + 1);
  }
  // The CSS class is always the general player styling class plus the data
  // for this specific player.
  this.classFor += ' ' + this.idFor("data");

  // Map from special counts (such as number of gardens) to count.
  this.special_counts = { "Treasure" : 7, "Victory" : 3, "Uniques" : 2 };
  this.card_counts = { "Copper" : 7, "Estate" : 3 };
  this.cards_aside = {};

  if (this.isTrash) {
    this.special_counts = {};
    this.card_counts = {};
    this.deck_size = 0;
    this.score = 0;
  }

  // Remember the img node for the player's icon
  this.setIcon = function(imgNode) {
    if (imgNode == null) return;
    this.icon = imgNode.cloneNode(true);
    this.icon.removeAttribute("class");
    this.icon.setAttribute("align", "top");
  };

  this.updateScore = function() {
    fields.set('score', this.getScore());
  };

  this.updateDeck = function() {
    fields.set('deck', this.getDeckString());
  };

  this.getScore = function() {
    var score_str = this.score;
    var total_score = this.score;

    if (this.special_counts["Gardens"] != undefined) {
      var gardens = this.special_counts["Gardens"];
      var garden_points = Math.floor(this.deck_size / 10);
      score_str = score_str + "+" + gardens + "g@" + garden_points;
      total_score = total_score + gardens * garden_points;
    }

    if (this.special_counts["Duke"] != undefined) {
      var dukes = this.special_counts["Duke"];
      var duke_points = 0;
      if (this.special_counts["Duchy"] != undefined) {
        duke_points = this.special_counts["Duchy"];
      }
      score_str = score_str + "+" + dukes + "d@" + duke_points;
      total_score = total_score + dukes * duke_points;
    }

    if (this.special_counts["Vineyard"] != undefined) {
      var vineyards = this.special_counts["Vineyard"];
      var vineyard_points = 0;
      if (this.special_counts["Actions"] != undefined) {
        vineyard_points = Math.floor(this.special_counts["Actions"] / 3);
      }
      score_str = score_str + "+" + vineyards + "v@" + vineyard_points;
      total_score = total_score + vineyards * vineyard_points;
    }

    if (this.special_counts["Fairgrounds"] != undefined) {
      var fairgrounds = this.special_counts["Fairgrounds"];
      var fairgrounds_points = 0;
      if (this.special_counts["Uniques"] != undefined) {
        fairgrounds_points = Math.floor(this.special_counts["Uniques"] / 5) * 2;
      }
      score_str = score_str + "+" + fairgrounds + "f@" + fairgrounds_points;
      total_score = total_score + fairgrounds * fairgrounds_points;
    }

    if (total_score != this.score) {
      score_str = score_str + "=" + total_score;
    }
    return score_str;
  };

  this.getDeckString = function() {
    var str = this.deck_size;
    var need_action_string = (show_action_count &&
        this.special_counts["Actions"]);
    var need_unique_string = (show_unique_count &&
        this.special_counts["Uniques"]);
    var need_duchy_string = (show_duchy_count && this.special_counts["Duchy"]);
    if (need_action_string || need_unique_string || need_duchy_string) {
      var special_types = [];
      if (need_unique_string) {
        special_types.push(this.special_counts["Uniques"] + "u");
      }
      if (need_action_string) {
        special_types.push(this.special_counts["Actions"] + "a");
      }
      if (need_duchy_string) {
        special_types.push(this.special_counts["Duchy"] + "d");
      }
      str += '(' + special_types.join(", ") + ')';
    }
    return str;
  };

  this.changeScore = function(points) {
    this.score = this.score + parseInt(points);
  };

  this.changeSpecialCount = function(name, delta) {
    if (this.special_counts[name] == undefined) {
      this.special_counts[name] = 0;
    }
    this.special_counts[name] = this.special_counts[name] + delta;
  };

  this.updateCardDisplay = function(name) {
    var cardId = this.idFor(name);
    var cardCountCell = document.getElementById(cardId);
    if (cardCountCell) {
      cardCountCell.innerHTML = this.cardCountString(name);
    }
  };

  this.recordCards = function(name, count) {
    if (this.card_counts[name] == undefined || this.card_counts[name] == 0) {
      this.card_counts[name] = count;
      this.special_counts["Uniques"] += 1;
    } else {
      this.card_counts[name] += count;
    }

    if (this.card_counts[name] <= 0) {
      if (this.card_counts[name] < 0) {
        handleError("Card count for " + name + " is negative (" +
            this.card_counts[name] + ")");
      }
      delete this.card_counts[name];
      this.special_counts["Uniques"] -= 1;
    }
    this.updateCardDisplay(name);
  };

  this.recordSpecialCards = function(card, count) {
    var name = card.innerHTML;
    if (name.indexOf("Gardens") == 0) {
      this.changeSpecialCount("Gardens", count);
    }
    if (name.indexOf("Duke") == 0) {
      this.changeSpecialCount("Duke", count);
    }
    if (name.indexOf("Duchy") == 0 || name.indexOf("Duchies") == 0) {
      this.changeSpecialCount("Duchy", count);
    }
    if (name.indexOf("Vineyard") == 0) {
      this.changeSpecialCount("Vineyard", count);
    }
    if (name.indexOf("Fairgrounds") == 0) {
      this.changeSpecialCount("Fairgrounds", count);
    }

    var types = card.className.split("-").slice(1);
    for (type_i in types) {
      var type = types[type_i];
      if (type == "none" || type == "duration" || type == "action" ||
          type == "reaction") {
        this.changeSpecialCount("Actions", count);
      } else if (type == "curse") {
        this.changeSpecialCount("Curse", count);
      } else if (type == "victory") {
        this.changeSpecialCount("Victory", count);
      } else if (type == "treasure") {
        this.changeSpecialCount("Treasure", count);
      } else {
        handleError("Unknown card class: " + card.className + " for " +
            card.innerText);
      }
    }
  };

  // Add an "other" card. These always are unique, so count really should always
  // be either +1 or -1. Adding in the 'cardname' attribute means that hovering
  // over the card will pop up the tooltip window about the card.
  this.addOtherCard = function(cardElem, count) {
    var cardName = cardElem.innerText;
    if (count > 0) {
      var addingAttr = cardElem.getAttribute('cardname') == undefined;
      if (addingAttr) cardElem.setAttribute('cardname', cardName);
      this.otherCards[cardName] = cardElem.outerHTML;
      if (addingAttr) cardElem.removeAttribute('cardname');
    } else {
      delete this.otherCards[cardName];
    }
    fields.set('otherCards', this.otherCardsHTML());
  };

  // Return HTML string to display the "other" cards this player has.
  this.otherCardsHTML = function() {
    var otherCards = '';
    for (var name in this.otherCards) {
      if (otherCards.length > 0) {
        otherCards += ", ";
      }
      otherCards += this.otherCards[name];
    }
    return otherCards;
  };

  this.gainCard = function(card, count, trashing) {
    trashing = trashing == undefined ? true : trashing;
    if (debug_mode) {
      $('#log').children().eq(-1).before('<div class="gain_debug">*** ' + name +
          " gains " + count + " " + card.innerText + "</div>");
    }
    // You can't gain or trash cards while possessed.
    if (possessed_turn && (this == last_player || this.isTrash)) return;

    last_gain_player = this;
    count = parseInt(count);
    this.deck_size = this.deck_size + count;

    var singular_card_name = getSingularCardName(card.innerText);
    this.changeScore(pointsForCard(singular_card_name) * count);
    this.recordSpecialCards(card, count);
    this.recordCards(singular_card_name, count);
    if (!supplied_cards[singular_card_name]) {
      this.addOtherCard(card, count);
    }

    // If the count is going down, usually this is trashing a card.
    if (!this.isTrash && count < 0 && trashing) {
      trashPlayer.gainCard(card, -count);
      updateDeck(trashPlayer);
    }
  };

  // This player has resigned; remember it.
  this.setResigned = function() {
    if (this.resigned) return;

    // In addition to other classes, this is now in the "resigned" class.
    this.classFor += " resigned";
    $("." + this.idFor("data")).addClass("resigned");
    this.resigned = true;
  };

  this.setAside = function(elems) {
    for (var i = 0; i < elems.length; i++) {
      var card = elems[i];
      var cardName = getSingularCardName(card.innerText);
      if (!this.cards_aside[cardName]) {
        this.cards_aside[cardName] = 1;
      } else {
        this.cards_aside[cardName]++;
      }
      this.deck_size--;
      this.updateCardDisplay(cardName);
    }
  };

  this.cardCountString = function(cardName) {
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

  var ptab = $('#playerDataTable')[0];
  var row1 = addRow(ptab, this.classFor, '<td id="' + this.idFor("active") +
      '" class="activePlayerData" rowspan="1"></td>' + '<td id="' +
      this.idFor('name') + '" class="playerDataName" rowspan="0">' + this.name +
      '</td>');
  row1.attr('id', this.idFor('firstRow'));

  var activeCell = row1.children().first();
  var playerCell = activeCell.next();
  if (this.icon != undefined) {
    playerCell().children().first().before(this.icon.cloneNode(true))
  }
  var seenWide = false;
  var prev;
  var player = this;
  var fieldInsertPos = function(field) {
    if (!player.seenFirst) {
      player.seenFirst = true;
      return {toInsert: field.keyNode, after: $('#' + player.idFor('name'))};
    }

    function incrementRowspan(cell) {
      var curSpan = cell.attr('rowspan');
      cell.attr('rowspan', parseInt(curSpan) + 1);
    }

    incrementRowspan(activeCell);

    seenWide |= (field.tag == 'span');

    var row = $('<tr/>').addClass(player.classFor).attr('id',
        player.idFor('active'));
    if (!seenWide) {
      incrementRowspan(playerCell);
      row.append(field.keyNode);
    } else {
      var cell = $('<td/>').attr('colspan', 3).addClass('playerOtherCards');
      row.append(cell);
      cell.append(field.keyNode);
    }

    var after = (prev ? prev : $('#' + player.idFor('firstRow')));
    prev = row;
    return {toInsert: row, after: after};
  };

  var fields = new FieldGroup({idSource: this, findInsert: fieldInsertPos,
    keyClass: 'playerDataKey', valueClass: 'playerDataValue'});

  fields.add('score', {initial: this.getScore()});
  if (!this.isTrash) {
    fields.add('deck', {initial: this.getDeckString()});
  } else {
    fields.setVisible('score', false);
    fields.add('deck', {label: "Cards", initial: this.getDeckString()});
  }
  fields.add('otherCards', {label: 'Other Cards',
    initial: this.otherCardsHTML(), tag: 'span',
    isVisible: fieldInvisibleIfEmpty});
}

// This object holds on to the active data for a single player.
function ActiveData() {
  var dataTable = $('<table id="activePlayerDataTable"/>');
  var fieldGroup = new FieldGroup({idPrefix: 'active', under: dataTable,
    wrapper: fieldWrapInRow,
    keyClass: 'playerDataKey',
    valueClass: 'playerDataValue'});

  rewriteTree(function () {
    fieldGroup.add('actions', { initial: 1 });
    fieldGroup.add('buys', { initial: 1 });
    fieldGroup.add('coins', { initial: 0, prefix: '$' });
    fieldGroup.add('potions', { initial: 0, prefix: '◉' });
    fieldGroup.add('played', { initial: 0 });
  });

  // The default value of each field is held was set above, so remember them.
  this.fields = fieldGroup.values();

  // Reset all fields to their default values.
  this.reset = function() {
    for (var f in this.fields) {
      fieldGroup.set(f, this.fields[f]);
      this[f] = this.fields[f];
    }
  };

  this.top = function() {
    return dataTable;
  };

  // Change the value of a specific field.
  this.changeField = function(key, delta) {
    this[key] += delta;
    fieldGroup.set(key, this[key]);
  };

  this.setUsesPotions = function(usesPotions) {
    fieldGroup.setVisible('potions', usesPotions);
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
    if (card.Treasure != "0") {
      // The coins and potions from treasure cards are not reported.
      this.changeField('coins', count * card.getCoinCount());
      this.changeField('potions', count * card.getPotionCount());
    }
  };
}

// Create a new "player" whose "deck" is the trash.
function stateStrings() {
  var state = '';
  for (var player in players) {
    player = players[player];
    state += '<b>' + player.name + "</b>: " + player.getScore() +
        " points [deck size is " + player.getDeckString() + "] - " +
        JSON.stringify(player.special_counts) + "<br>" +
        JSON.stringify(player.card_counts) + "<br>";
  }
  return state;
}

function getSingularCardName(name) {
  return card_map[name].Singular;
}

function getPlayer(name) {
  if (players[name] == undefined) return null;
  return players[name];
}

function findTrailingPlayer(text) {
  var arr = text.match(/ ([^\s.]+)\.[\s]*$/);
  if (arr != null && arr.length == 2) {
    return getPlayer(arr[1]);
  }
  handleError("Could not find trailing player from: " + text);
  return null;
}

// At the start of each turn, place the active player data display in the
// proper place for the current player.
function placeActivePlayerData() {
  if (disabled) return;
  if (last_player == null) return;

  // Each player has a place for its active data, we just look it up here.
  var playerID = last_player.idFor("active");
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
}

// Check to see if the node shows that a player resigned.
function maybeHandleResignation(node) {
  if (node.innerText.match(/ resigns from the game\.$/)) {
    last_player.setResigned();
    return true;
  }
  return false;
}

function maybeHandleTurnChange(node) {
  var text = node.innerText;
  if (text.indexOf("—") != -1) {

    // This must be a turn start.
    if (text.match(/— Your (?:extra )?turn/)) {
      last_player = getPlayer("You");
    } else {
      var arr = text.match(/— (.+)'s .*turn/);
      if (arr && arr.length == 2) {
        last_player = getPlayer(arr[1]);
      } else {
        handleError("Couldn't handle turn change: " + text);
      }
    }

    if (last_player == null) {
      console.log("Failed to get player from: " + node.innerText);
    }

    activeData.reset();
    placeActivePlayerData();
    // The start of the turn is styled to match the player's data area.
    $(node).addClass(last_player.classFor);

    // If we don't know the icon, look it up from this turn start.
    if (last_player.icon == undefined) {
      var imgs = node.getElementsByTagName("img");
      if (imgs.length > 0)
        last_player.setIcon(imgs[0]);
    }

    possessed_turn = text.match(/\(possessed by .+\)/);

    if (debug_mode) {
      var details = " (" + getDecks() + " | " + getScores() + ")";
      node.innerHTML.replace(" —<br>", " " + details + " —<br>");
    }

    if (text_mode) {
      // For some reason, during reload IDs get reinserted by the client.js, so
      // we remove the duplicates.
      stripDuplicateLogs();
    }

    return true;
  }
  return false;
}

function stripDuplicateLogs() {
  $('.logline').each(function() {
    var $this = $(this);
    if ($this[0].id == $this.next()[0].id) {
      $this.remove();
    }
  })
}

// Adjust the value of a piece of active player data if there is a specification
// for the number by which to adjust it.
function adjustActive(key, spec) {
  if (spec != null) {
    activeData.changeField(key, parseInt(spec[1]));
  }
}

// If appropriate, adjust active data values. Return 'true' if there is no
// possibility of other useful data to be handled in this log line.
function maybeHandleActiveCounts(elems, text) {
  // Handle lines like "You play a Foo", or "You play a Silver and 2 Coppers."
  if (text.match(/ plays? /)) {
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

function handleScoping(text_arr, text) {
  var depth = 1;
  for (var t in text_arr) {
    if (text_arr[t] == "...") ++depth;
  }
  var scope = '';
  while (depth <= scopes.length) {
    scope = scopes.pop();
  }
  if (text.indexOf("revealing a Watchtower") != -1 ||
      text.indexOf("You reveal a Watchtower") != -1) {
    scope = 'Watchtower';
  } else {
    var re = new RegExp("You|" + player_re + "plays? an? ([^.]*).");
    var arr = text.match(re);
    if (arr && arr.length == 2) {
      scope = arr[1];
    }
  }
  scopes.push(scope);
}

function maybeReturnToSupply(text) {
  unpossessed(function () {
    if (text.indexOf("it to the supply") != -1) {
      last_player.gainCard(last_reveal_card, -1, false);
    } else {
      var arr = text.match("([0-9]*) copies to the supply");
      if (arr && arr.length == 2) {
        last_player.gainCard(last_reveal_card, -arr[1], false);
      }
    }
  });
}

function maybeHandleExplorer(elems, text) {
  if (text.match(/gain(ing)? a (Silver|Gold) in (your )?hand/)) {
    last_player.gainCard(elems[elems.length - 1], 1);
    return true;
  }
  return false;
}

function maybeHandleMint(elems, text) {
  if (elems.length != 1) return false;
  if (text.match("and gain(ing)? another one.")) {
    last_player.gainCard(elems[0], 1);
    return true;
  }
  return false;
}

function maybeHandleTradingPost(elems, text) {
  if (text.indexOf(", gaining a Silver in hand") == -1) {
    return false;
  }
  if (elems.length != 2 && elems.length != 3) {
    handleError("Error on trading post: " + text);
    return true;
  }
  var elem = 0;
  last_player.gainCard(elems[0], -1);
  if (elems.length == 3) elem++;
  last_player.gainCard(elems[elem++], -1);
  last_player.gainCard(elems[elem], 1);
  return true;
}

function maybeHandleSwindler(elems, text) {
  var player = null;
  if (text.indexOf("replacing your") != -1) {
    player = getPlayer("You");
  }
  var arr = text.match(new RegExp("You replace " + player_re + "'s"));
  if (!arr) arr = text.match(new RegExp("replacing " + player_re + "'s"));
  if (arr && arr.length == 2) {
    player = getPlayer(arr[1]);
  }

  if (player) {
    if (elems.length == 2) {
      // Note: no need to subtract out the swindled card. That was already
      // handled by maybeHandleOffensiveTrash.
      player.gainCard(elems[1], 1);
    } else {
      handleError("Replacement has " + elems.length + " elements: " + text);
    }
    return true;
  }
  return false;
}

//noinspection JSUnusedLocalSymbols
function maybeHandlePirateShip(elems, text_arr, text) {
  // Swallow gaining pirate ship tokens.
  // It looks like gaining a pirate ship otherwise.
  if (text.indexOf("a Pirate Ship token") != -1) return true;
  return false;
}

function maybeHandleSeaHag(elems, text_arr, text) {
  if (text.indexOf("a Curse on top of") != -1) {
    if (elems < 1 || elems[elems.length - 1].innerHTML != "Curse") {
      handleError("Weird sea hag: " + text);
      return false;
    }
    getPlayer(text_arr[0]).gainCard(elems[elems.length - 1], 1);
    return true;
  }
  return false;
}

// This can be triggered by Saboteur, Swindler, and Pirate Ship.
function maybeHandleOffensiveTrash(elems, text_arr, text) {
  if (elems.length == 1) {
    if (text.indexOf("is trashed.") != -1) {
      last_reveal_player.gainCard(elems[0], -1);
      return true;
    }
    if (text.indexOf("and trash it.") != -1 ||
        text.indexOf("and trashes it.") != -1) {
      getPlayer(text_arr[0]).gainCard(elems[0], -1);
      return true;
    }

    if (text.match(/trashes (?:one of )?your/)) {
      last_reveal_player.gainCard(elems[0], -1);
      return true;
    }

    var arr = text.match(new RegExp("trash(?:es)? (?:one of )?" + player_re +
        "'s"));
    if (arr && arr.length == 2) {
      getPlayer(arr[1]).gainCard(elems[0], -1);
      return true;
    }
    return false;
  }
  return false;
}

function maybeHandleTournament(elems, text_arr, text) {
  if (elems.length == 2 && text.match(/and gains? a .+ on (the|your) deck/)) {
    getPlayer(text_arr[0]).gainCard(elems[1], 1);
    return true;
  }
  return false;
}

function maybeHandleIsland(elems, text_arr, text) {
  if (text.match(/ set(ting|s)? aside /)) {
    var player = getPlayer(text_arr[0]);
    if (player == null)
      player = last_player;
    player.setAside(elems);
    return true;
  }
  return false;
}

function maybeHandleVp(text) {
  var re = new RegExp("[+]([0-9]+) ▼");
  var arr = text.match(re);
  if (arr && arr.length == 2) {
    last_player.changeScore(arr[1]);
  }
}

function getCardCount(card, text) {
  var count = 1;
  var re = new RegExp("([0-9]+) " + card);
  var arr = text.match(re);
  if (arr && arr.length == 2) {
    count = arr[1];
  }
  return count;
}

function handleGainOrTrash(player, elems, text, multiplier) {
  for (var elem in elems) {
    if (elems[elem].innerText != undefined) {
      var card = elems[elem].innerText;
      var count = getCardCount(card, text);
      var num = multiplier * count;
      if (possessed_turn && num < 0) {
        // Skip trashing any cards during possession.
      } else {
        player.gainCard(elems[elem], num);
      }
    }
  }
}

function maybeHandleGameStart(node) {
  var nodeText = node.innerText;
  if (nodeText == null || nodeText.indexOf("Turn order") != 0) {
    return false;
  }
  initialize(node);
  ensureLogNodeSetup(node);
  return true;
}

function nextLogId() {
  return "logLine" + next_log_line_num++;
}

function ensureLogNodeSetup(node) {
  if (!node.id) {
    node.id = nextLogId();
  }
  node.addEventListener("DOMNodeRemovedFromDocument", reinsert);
}

// Perform a function that should behave the same whether or not the current
// player is posessed.
function unpossessed(action) {
  // Remember the current state of possession.
  var originallyPossessed = possessed_turn;
  try {
    possessed_turn = false;
    action();
  } finally {
    possessed_turn = originallyPossessed;
  }
}

function handleLogEntry(node) {
  if (maybeHandleGameStart(node)) return;

  if (!started) return;

  // Ignore the purple log entries during posession.
  // When someone is possessed, log entries with "possessed-log" are what
  // describe the "possession". The other (normal) log entries describe the
  // actual game effect. So we ignore the "possessed" entries because they
  // are what is being commanded, not what is actually happening to the cards.
  // (For example, if you possess Alice, then in "possessed-log" entries, it
  // says "You play a Silver", but the actual game effect is as if Alice played
  // the Silver (that is, Alice, as a player, gets $2 more to work with, it's
  // just that you, not Alice, are deciding what to do with that $2).
  if (possessed_turn && $(node).hasClass("possessed-log")) return;

  ensureLogNodeSetup(node);
  maybeRewriteName(node);

  if (maybeHandleTurnChange(node)) return;
  if (maybeHandleResignation(node)) return;

  // Make sure this isn't a duplicate possession entry.
  if (node.className.indexOf("logline") < 0) return;

  var text = node.innerText.split(" ");

  // Keep track of what sort of scope we're in for things like watchtower.
  handleScoping(text, node.innerText);

  // Gaining VP could happen in combination with other stuff.
  maybeHandleVp(node.innerText);

  var elems = node.getElementsByTagName("span");
  if (maybeHandleActiveCounts(elems, node.innerText)) return;
  if (elems.length == 0) {
    maybeReturnToSupply(node.innerText);
    return;
  }

  // Remove leading stuff from the text.
  var i = 0;
  for (i = 0; i < text.length; i++) {
    if (!text[i].match(/^[. ]*$/)) break;
  }
  if (i == text.length) return;
  text = text.slice(i);

  if (maybeHandleMint(elems, node.innerText)) return;
  if (maybeHandleTradingPost(elems, node.innerText)) return;
  if (maybeHandleExplorer(elems, node.innerText)) return;
  if (maybeHandleSwindler(elems, node.innerText)) return;
  if (maybeHandlePirateShip(elems, text, node.innerText)) return;
  if (maybeHandleSeaHag(elems, text, node.innerText)) return;
  if (maybeHandleOffensiveTrash(elems, text, node.innerText)) return;
  if (maybeHandleTournament(elems, text, node.innerText)) return;
  if (maybeHandleIsland(elems, text, node.innerText)) return;

  if (text[0] == "trashing") {
    var player = last_player;
    if (scopes[scopes.length - 1] == "Watchtower") {
      player = last_gain_player;
    }
    return handleGainOrTrash(player, elems, node.innerText, -1);
  }
  if (text[1].indexOf("trash") == 0) {
    return handleGainOrTrash(getPlayer(text[0]), elems, node.innerText, -1);
  }
  if (text[0] == "gaining") {
    return handleGainOrTrash(last_player, elems, node.innerText, 1);
  }
  if (text[1].indexOf("gain") == 0) {
    return handleGainOrTrash(getPlayer(text[0]), elems, node.innerText, 1);
  }

  // Mark down if a player reveals cards.
  if (text[1].indexOf("reveal") == 0) {
    last_reveal_player = getPlayer(text[0]);
  }

  // Expect one element from here on out.
  if (elems.length > 1) return;

  // It's a single card action.
  var card_elem = elems[0];
  var card_name = elems[0].innerText;
  var card = card_map[card_name];

  var player = getPlayer(text[0]);
  var action = text[1];
  if (action.indexOf("buy") == 0) {
    // In possessed turns, it isn't who buys something, it's who "gains" it
    // (and who gains it is stated in a separate log entry).
    if (!possessed_turn) {
      var count = getCardCount(card_name, node.innerText);
      player.gainCard(card_elem, count);
      activeData.changeField('buys', -count);
      activeData.changeField('coins', -card.getCurrentCoinCost());
      activeData.changeField('potions', -card.getCurrentPotionCost());
    }
  } else if (action.indexOf("pass") == 0) {
    unpossessed(function() {
      if (player_count != 2) {
        maybeAnnounceFailure(">> Warning: Masquerade with more than 2 " +
            "players causes inaccurate score counting.");
      }
      player.gainCard(card_elem, -1, false);
      var other_player = findTrailingPlayer(node.innerText);
      if (other_player != null) {
        other_player.gainCard(card_elem, 1);
      }
    });
  } else if (action.indexOf("receive") == 0) {
    unpossessed(function() {
      player.gainCard(card_elem, 1);
      var other_player = findTrailingPlayer(node.innerText);
      if (other_player != null) {
        other_player.gainCard(card_elem, -1, false);
      }
    });
  } else if (action.indexOf("reveal") == 0) {
    last_reveal_card = card_elem;
  }
}

function getScores() {
  var scores = "Points: ";
  for (var player in players) {
    scores = scores + " " + player + "=" + players[player].getScore();
  }
  return scores;
}

// Add a row to a table.
function addRow(tab, rowClass, innerHTML) {
  var r = $('<tr/>');
  if (rowClass)
    r.addClass(rowClass);
  $(tab).append(r);
  r.html(innerHTML);
  return r;
//  var r = document.createElement("tr");
//  if (rowClass)
//    r.setAttribute("class", rowClass);
//  tab.appendChild(r);
//  r.innerHTML = innerHTML;
//  return r;
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

  // Any row that spans a number of columns should span the added columns.
  // Use the attribute "grown" to avoid adjusting the same thing multiple times.
  var toAdd = player_count + 1; // the extra is for the trash player

  $("#supply > table > tbody > tr > td[colspan]:not([grown])").each(function() {
    var $this = $(this);
    var origSpanStr = $this.attr('colspan');
    var origSpan = parseInt(origSpanStr);
    $this.attr('colspan', (origSpan + toAdd) + "");
    $this.attr('grown', toAdd + "");
  });

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

// Execute a function for all players, including the trash player.
function allPlayers(func) {
  for (var playerName in players) {
    func(players[playerName]);
  }
  if (trashPlayer) {
    func(trashPlayer);
  }
}

// Return the string used for DOM ID's for a given (card) name -- we
// canonicalize it to be always lower case, stripping out non-letters.
function toIdString(name) {
  return name.replace(/[^a-zA-Z]/gi, "").toLowerCase();
}

function updateScores() {
  if (last_player == null) return;
  rewriteTree(function() {
    allPlayers(function(player) {
      player.updateScore();
    });
  });
}

// If the player area does not exist, create it. For some reason, the table that
// contains the player area is rebuilt during play (I think whenever a card is
// bought).
function setupPlayerArea() {
  var ptab = document.createElement("table");
  if (!text_mode) {
    ptab.setAttribute("align", "right");
  }
  ptab.id = 'playerDataTable';

  if (text_mode) {
    var outerTable = document.createElement("table");
    outerTable.id = "playerDataArranger";
    var row = addRow(outerTable, null,
        '<td id="playerDataContainer" valign="bottom"></td>' +
            '<td id="logContainer" valign="bottom"></td>');
    row = row[0]; //!! Change this code to jquery code
    row.firstChild.appendChild(ptab);
    row.lastChild.appendChild(document.getElementById("log"));
    row.lastChild.appendChild(document.getElementById("choices"));
    var game = document.getElementById("game");
    game.insertBefore(outerTable, game.firstElementChild);
  } else {
    var tab = player_spot.firstElementChild;
    // tab can be null at the end of a game when returning to the lobby
    if (tab != null) {
      var outerCell = $('<td valign="bottom"/>');
      $(player_spot).replaceWith(outerCell);
      outerCell.append(ptab);
      outerCell.append(player_spot);
    }
  }
}

// As needed, set up player data area and the per-card count columns.
function setupPerPlayerInfoArea() {
  if (disabled) return;

  //!! Show how far through the deck each player is
  //!! Include sub-score areas for each 'extra' type (Duke, Fairgrounds, ...)
  //!! Show how much each 'extra' type would be worth (Duke, Fairgrounds, ...)
  //!! Put counting options in a pop-up window or something
  rewriteTree(function () {
    setupPlayerArea();

    if (text_mode) {
      setupPerPlayerTextCardCounts();
    } else {
      setupPerPlayerImageCardCounts('kingdom');
      setupPerPlayerImageCardCounts('basic');
    }

    placeActivePlayerData();
  });
}

// Remove the player area, such as at the end of the game or if disabled.
function removePlayerArea() {
  var ptab = document.getElementById("playerData");
  if (!ptab) {
    // If there is no overall 'playerData' item, then it's just the table
    ptab = document.getElementById('playerDataTable');
  }
  if (ptab != null && ptab.parentNode != null) {
    removeActivePlayerData();
    ptab.parentNode.removeChild(ptab);
  }
  $(".playerCardCountCol").remove();

  $('#supply td[grown]').each(function() {
    var $this = $(this);
    var grownBy = $this.attr('grown');
    var colspan = $this.attr('colspan');
    $this.attr('colspan', (parseInt(colspan) - parseInt(grownBy)));
    $this.removeAttr('grown');
  });
}

function getDecks() {
  var decks = "Cards: ";
  for (var player in players) {
    decks = decks + " " + player + "=" + players[player].getDeckString();
  }
  return decks;
}

function updateDeck(player) {
  player = player || last_player;
  if (player == null) return;
  rewriteTree(function() {
    player.updateDeck();
  });
}

function initialize(doc) {
  started = true;
  introduced = false;
  i_introduced = false;
  disabled = false;
  had_error = false;
  possessed_turn = false;
  announced_error = false;
  next_log_line_num = 0;

  last_gain_player = null;
  scopes = [];

  discoverGUIMode();
  setupPerPlayerInfoArea();

  players = new Object();
  player_rewrites = new Object();
  player_re = "";
  player_count = 0;
  trashPlayer = new Player('Trash', i);
  activeData = new ActiveData();

  // Figure out which cards are in supply piles
  supplied_cards = {};
  $("[cardname]").each(function() {
    supplied_cards[$(this).attr("cardname")] = true;
  });
  activeData.setUsesPotions(supplied_cards['Potion'] != undefined);

  if (localStorage.getItem("disabled")) {
    disabled = true;
  }

  // Figure out which turn we are. We'll use that to figure out how long to wait
  // before announcing the extension.
  var self_index = -1;

  //!! We need to also rewrite players named "you", "You", "Your", etc.
  // Hack: collect player names with spaces and apostrophes in them. We'll
  // rewrite them and then all the text parsing works as normal.
  var p = "(?:([^,]+), )";    // an optional player
  var pl = "(?:([^,]+),? )";  // the last player (might not have a comma)
  var re = new RegExp("Turn order is (?:(you)|" + p + "?" + p + "?" + p + "?" +
      pl + "and then (.+))\\.");
  var arr = doc.innerText.match(re);
  if (arr == null) {
    handleError("Couldn't parse: " + doc.innerText);
  }
  var other_player_names = [];
  player_count = 0;
  for (var i = 1; i < arr.length; ++i) {
    if (arr[i] == undefined) continue;

    player_count++;
    if (arr[i] == "you") {
      self_index = player_count;
      arr[i] = "You";
    }
    var rewritten = rewriteName(arr[i]);
    if (rewritten != arr[i]) {
      player_rewrites[arr[i]] = rewritten;
      arr[i] = rewritten;
    }
    // Initialize the player.
    players[arr[i]] = new Player(arr[i], player_count);

    if (arr[i] != "You") {
      other_player_names.push(RegExp.quote(arr[i]));
    }

  }
  player_re = '(' + other_player_names.join('|') + ')';

  // The trash player is created first but should be listed last.
  var trashRow = $('#' + trashPlayer.idFor('firstRow'));
  $('.trash').each(function() {
    trashRow.closest('table').append($(this));
  });

  if (!disabled) {
    updateScores();
    updateDeck();
  }

  // Assume it's already introduced if it's rewriting the tree for a reload.
  // Otherwise setup to maybe introduce the extension.
  if (!rewritingTree) {
    var wait_time = 200 * Math.floor(Math.random() * 10 + 5);
    if (self_index != -1) {
      wait_time = 300 * self_index;
    }
    console.log("Waiting " + wait_time + " to introduce " + "(index is: " +
        self_index + ").");
    setTimeout("maybeIntroducePlugin()", wait_time);
  }
}

function maybeRewriteName(doc) {
  if (doc.innerHTML != undefined && doc.innerHTML != null) {
    for (var player in player_rewrites) {
      doc.innerHTML = doc.innerHTML.replace(player, player_rewrites[player]);
    }
  }
}

function maybeIntroducePlugin() {
  if (!introduced && !disabled) {
    writeText("★ Game scored by Dominion Point Counter ★");
    writeText("http://goo.gl/iDihS");
    writeText("Type !status to see the current score.");
    if (localStorage["allow_disable"] != "f") {
      writeText("Type !disable to disable the point counter.");
    }
  }
}

function maybeShowStatus(request_time) {
  if (last_status_print < request_time) {
    last_status_print = new Date().getTime();
    var to_show = ">> " + getDecks() + " | " + getScores();
    var my_name = localStorage["name"];
    if (my_name == undefined || my_name == null) my_name = "Me";
    writeText(to_show.replace(/You=/g, my_name + "="));
  }
}

function handleChatText(speaker, text) {
  if (!text) return;
  if (disabled) return;
  if (text == " !status") {
    var time = new Date().getTime();
    var command = "maybeShowStatus(" + time + ")";
    var wait_time = 200 * Math.floor(Math.random() * 10 + 1);
    // If we introduced the extension, we get first dibs on answering.
    if (i_introduced) wait_time = 100;
    setTimeout(command, wait_time);
  }
  if (localStorage["allow_disable"] != "f" && text == " !disable") {
    localStorage.setItem("disabled", "t");
    disabled = true;
    stopCounting();
    removePlayerData();
    writeText(">> Point counter disabled.");
  }

  if (text.indexOf(" >> ") == 0) {
    last_status_print = new Date().getTime();
  }
  if (!introduced && text.indexOf(" ★ ") == 0) {
    introduced = true;
    if (speaker == localStorage["name"]) {
      i_introduced = true;
    }
  }
}

function addSetting(setting, output) {
  if (localStorage[setting] != undefined) {
    output[setting] = localStorage[setting];
  }
}
function settingsString() {
  var settings = new Object();
  addSetting("debug", settings);
  addSetting("allow_disable", settings);
  addSetting("name", settings);
  addSetting("status_announce", settings);
  addSetting("status_msg", settings);
  return JSON.stringify(settings);
}

function removePlayerData() {
  removePlayerArea();
  forgetGUIMode();
}

function stopCounting() {
  deck_spot.innerHTML = "exit";
  points_spot.innerHTML = "faq";

  localStorage.removeItem("log");
  text_mode = undefined;
}

function handleGameEnd(doc) {
  for (var node in doc.childNodes) {
    var childNode = doc.childNodes[node];
    if (childNode.innerText == "game log") {
      // Reset exit / faq at end of game.
      started = false;
      stopCounting();
      // Collect information about the game.
      var href = childNode.href;
      var game_id_str = href.substring(href.lastIndexOf("/") + 1);
      var name = localStorage["name"];
      if (name == undefined || name == null) name = "Unknown";

      // Double check the scores so we can log if there was a bug.
      var has_correct_score = true;
      var optional_state_strings = "";
      var win_log = document.getElementsByClassName("em");
      if (!announced_error && win_log && win_log.length == 1) {
        var summary = win_log[0].previousSibling.innerText;
        for (player in players) {
          var player_name = players[player].name;
          if (player_name == "You") {
            player_name = rewriteName(name);
          }
          var re = new RegExp(RegExp.quote(player_name) +
              " has ([0-9]+) points");
          var arr = summary.match(re);
          if (arr && arr.length == 2) {
            var score = ("" + players[player].getScore()).replace(/^.*=/, "");
            if (score.indexOf("+") != -1) {
              score = ("" + players[player].getScore()).replace(/^([0-9]+)\+.*/,
                  "$1");
            }
            if (has_correct_score && arr[1] != score) {
              has_correct_score = false;
              optional_state_strings = stateStrings();
              break;
            }
          }
        }
      } else if (childNode.innerText = "return") {
        childNode.addEventListener("DOMActivate", function() {
          removePlayerData();
        }, true);
      }

      // Post the game information to app-engine for later use for tests, etc.
      //noinspection JSUnusedGlobalSymbols
      chrome.extension.sendRequest({
        type: "log",
        game_id: game_id_str,
        reporter: name,
        correct_score: has_correct_score,
        state_strings: optional_state_strings,
        log: document.body.innerHTML,
        version: extension_version,
        settings: settingsString() });
      break;
    }
  }
}

/**
 * This event handler is called when a logline node is being removed. We
 * don't want log lines removed, so when this happens, we insert another
 * copy of the node into the parent to take its place. This copy will remain
 * behind after the original node is actually removed (which comes after the
 * event notification phase).
 */
function reinsert(ev) {
  if (!started) {
    // The game isn't running so let the nodes go away.
    return;
  }

  var node = ev.target;
  var next = node.nextElementSibling;
  var prev = node.previousElementSibling;
  var duplicated = (next != undefined && next.id == node.id) ||
      (prev != undefined && prev.id == node.id);
  if (!duplicated) {
    var copy = node.cloneNode(true);
    // The "fading" of old log messages reduces opacity to near zero; clear that
    copy.removeAttribute("style");
    rewriteTree(function () {
      node.parentNode.insertBefore(copy, node);
    });
  }
}

// If this connotes the start of the game, start it.
function maybeStartOfGame(node) {
  var nodeText = node.innerText.trim();
  if (nodeText.length == 0) {
    return;
  }

  if (localStorage.getItem("log") == undefined &&
      nodeText.indexOf("Your turn 1 —") != -1) {
    // We don't have a log but it's turn 1. This must be a solitaire game.
    // Create a fake (and invisible) setup line. We'll get called back again
    // with it.
    console.log("Single player game.");
    node = $('<div class="logline" style="display:none;">' +
        'Turn order is you.</div>)').insertBefore(node)[0];
    return;
  }

  // The first line of actual text is either "Turn order" or something in
  // the middle of the game.
  if (nodeText.indexOf("Turn order") == 0) {
    // The game is starting, so put in the initial blank entries and clear
    // out any local storage.
    console.log("--- starting game ---");
    next_log_line_num = 0;
    localStorage.removeItem("log");
    localStorage.removeItem("disabled");
  } else {
    console.log("--- replaying history ---");
    disabled = localStorage.getItem("disabled") == "t";
    restoreHistory(node);
  }
  started = true;
}

// Returns true if the log node should be handled as part of the game.
function logEntryForGame(node) {
  if (inLobby()) {
    return false;
  }

  if (!started) {
    maybeStartOfGame(node);
  }
  return started;
}

// Restore the game history from a stored log.
function restoreHistory(node) {
  // The first log line is not the first line of the game, so restore the
  // log from history. Of course, there must be a log history to restore.
  var logHistory = localStorage.getItem("log");
  if (logHistory == undefined || logHistory.length == 0) {
    return;
  }

  console.log("--- restoring log ---" + "\n");
  // First build a DOM tree of the old log messages in a copy of the log
  // parent node.
  var storedLog = node.parentNode.cloneNode(false);
  storedLog.innerHTML = logHistory;

  // Now that we've pulled the log out of the history, remove it so that it
  // starts out empty, just like it does in the original game.
  localStorage.removeItem('log');

  // Write all the entries from the history into the log up to (but not
  // including) the one that matches the newly added entry that triggered
  // the need to restore the history.
  rewriteTree(function () {
    var logRegion = node.parentElement;
    // First, clear out anything that's currently there before the newly
    // added entry.
    while (logRegion.hasChildNodes() && logRegion.firstChild != node) {
      logRegion.removeChild(logRegion.firstChild);
    }
    var newLogEntryInner = node.innerHTML;
    while (storedLog.hasChildNodes()) {
      var line = storedLog.removeChild(storedLog.firstChild);
      // The way we avoid logs going away is to put them back in when they
      // go away. So a stored log can capture both log nodes -- the
      // replacement and the fading original. So we have to make sure that
      // the log entry hasn't already been handled.
      if (document.getElementById(line.id) != undefined) {
        continue;
      }

      // This might be the "faded" version with low opacity, so remove that.
      var style = line.getAttribute("style");
      if (style && style.indexOf("opacity") >= 0) {
        line.removeAttribute("style");
      }

      if (line.innerHTML == newLogEntryInner) {
        var lastLineNum = line.id.match(/[0-9]+/);
        next_log_line_num = parseInt(lastLineNum);
        break;
      } else {
        // move the node to the actual log region
        logRegion.insertBefore(line, node);
        handleLogEntry(line);
      }
    }
  });
}

function inLobby() {
  // In the lobby there is no real supply region -- it's empty.
  return (player_spot == undefined || player_spot.childElementCount == 0);
}

// Drop any state related to knowing text vs. image mode.
function forgetGUIMode() {
  document.firstChild.id = "";
  $("#body").removeClass("textMode").removeClass("imageMode")
      .removeClass("playing");
}

// Discover whether we are in text mode or image mode. The primary bit of state
// that this sets is for the benefit of CSS: If we are in text mode, body tag
// has the "textMode" class, otherwise it has the "imageMode" class. In both
// cases it has the "playing" class, which allows CSS to tell the difference
// between being in the lobby vs. playing an actual game.
function discoverGUIMode() {
  var href = gui_mode_spot.getAttribute("href");
  // The link is to the "text" mode when it's in image mode and vice versa.
  text_mode = href.indexOf("text") < 0;

  // Setting the class enables css selectors that distinguish between the modes.
  $("#body").addClass("playing").addClass(text_mode ? "textMode" : "imageMode");
}

// Perform a function that rewrites the tree, suppressing the processing of all
// change-related DOM events.
function rewriteTree(func) {
  try {
    rewritingTree++;
    func();
  } finally {
    rewritingTree--;
  }
}

function handle(doc) {
  // Ignore DOM events when we are rewritting the tree; see rewriteTree().
  if (rewritingTree > 0) return;

  try {
    // Detect the "Say" button so we can find some children
    if (doc.constructor == HTMLDivElement &&
        doc.innerText.indexOf("Say") == 0) {
      // Pull out the links for future reference.
      var links = doc.getElementsByTagName("a");
      gui_mode_spot = links[0];
      deck_spot = links[1];
      points_spot = links[2];
    }

    if (doc.className && doc.className.indexOf("logline") >= 0) {
      if (logEntryForGame(doc)) {
        handleLogEntry(doc);
        if (started) {
          localStorage.setItem("log", doc.parentElement.innerHTML);
        }
      }
    }

    // Remember the "supply" node for later use.
    if (doc.id == "supply") {
      player_spot = doc;
      doc.addEventListener("DOMNodeRemovedFromDocument", function() {
        console.log('removing supply');
      });
    }

    if (doc.id == 'sm2-container') {
      setupTooltips(doc);
      return;
    }

    // The child nodes of "supply" tell us whether certain cards are in play.
    if (doc.parentNode.id == "supply") {
      show_action_count = false;
      show_unique_count = false;
      show_duchy_count = false;
      var elems = doc.getElementsByTagName("span");
      for (var elem in elems) {
        if (elems[elem].innerText == "Vineyard") show_action_count = true;
        if (elems[elem].innerText == "Fairgrounds") show_unique_count = true;
        if (elems[elem].innerText == "Duke") show_duchy_count = true;
      }
    }

    // If the game hasn't started, everything after this is irrelevant.
    if (!started) {
      // This is sometimes left around
      if (document.getElementById("playerDataTable") && inLobby()) {
        removePlayerData();
      }
      return;
    }

    // If we're adding chioces, it may be the choices at the end of the game
    if (doc.constructor == HTMLDivElement && doc.parentNode.id == "choices") {
      handleGameEnd(doc);
      if (!started) return;
    }

    // We follow the chat lines to see if it says something we should react to.
    if (doc.parentNode.id == "chat" && doc.childNodes.length > 2) {
      handleChatText(doc.childNodes[1].innerText.slice(0, -1),
          doc.childNodes[2].nodeValue);
    }

    // Something was added, this is a good time to update the display.
    if (!disabled) {
      updateScores();
      updateDeck();
    }
  } catch (err) {
    console.log(doc);
    var error = '';
    if (doc.innerText != undefined) {
      error += "On '" + doc.innerText + "': ";
    }
    handleError("Javascript exception: " + debugString(err));
  }
}

//
// Chat status handling.
//

function buildStatusMessage() {
  var status_message = "/me Auto▼Count";
  if (localStorage["status_msg"] != undefined &&
      localStorage["status_msg"] != "") {
    status_message = status_message + " - " + localStorage["status_msg"];
  }
  return status_message;
}

function enterLobby() {
  if (localStorage["status_announce"] == "t" && $('#lobby').length != 0 &&
      $('#lobby').css('display') != "none") {
    // Set the original status message.
    writeText(buildStatusMessage());

    // Handle updating status message as needed.
    $('#entry').css('display', 'none');
    $('#entry')
        .after('<input id="fake_entry" class="entry" style="width: 350px;">');
    $('#fake_entry').keyup(function(event) {
      var value = $('#fake_entry').val();
      var re = new RegExp("^/me(?: (.*))?$");
      var arr = value.match(re);
      if (arr && arr.length == 2) {
        // This is a status message update.
        if (arr[1] != undefined) {
          localStorage["status_msg"] = arr[1];
        } else {
          localStorage.removeItem("status_msg");
        }
        value = buildStatusMessage();
      }
      $('#entry').val(value);

      if (event.which == 13) {
        getSayButton().click();
        $('#fake_entry').val("");
      }
    });

    getSayButton().addEventListener('click', function() {
      $('#fake_entry').val("");
    })
  }

  $('#tracker').attr('checked', true).attr('disabled', true);
  $('#autotracker').val('yes').attr('disabled', true);

  setupTooltips($('#sm2-container').prev()[0]);

  my_icon = $('#log img').first().get(0);
}

function setupTooltips(node) {
  tooltip = node;
  $(tooltip).attr("xyzzy", "true");
  var attr = tooltip.getAttributeNode('style');
  tooltip.addEventListener('DOMSubtreeModified', positionFromBottom);
  attr.addEventListener('DOMSubtreeModified', positionFromBottom);
}

function positionFromBottom() {
  if (rewritingTree) return;

  var jqDoc = $(tooltip);
  var style = jqDoc.attr('style');
  var xyzzy = jqDoc.attr("xyzzy");
  if (!style || style.match(/visibility:\s+hidden/) ||
      style.match(/display:\s+none/)) {
    tooltip_bottom = {};
    return;
  }

  style = style.replace(/position:\s+absolute/, 'position: fixed');
  var topRe = /\btop:\s*(-?[0-9]+)/;
  var m = style.match(topRe);
  if (m != null) {
    var bottom = tooltip_bottom[jqDoc.html()];
    if (!bottom) {
      bottom = (document.height - parseInt(m[1]));
      tooltip_bottom = {};
      tooltip_bottom[jqDoc.html()] = bottom;
//      console.log("now using " + bottom + "\n");
    } else {
//      console.log("reusing " + bottom + "\n");
    }
    style = style.replace(topRe, 'bottom: ' + bottom);
    rewriteTree(function () {
      jqDoc.attr('style', style);
    });
  }
}

setTimeout("enterLobby()", 600);

document.body.addEventListener('DOMNodeInserted', function(ev) {
  handle(ev.target);
});

chrome.extension.sendRequest({ type: "version" }, function(response) {
  extension_version = response;
});
