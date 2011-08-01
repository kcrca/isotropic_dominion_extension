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
var trashPlayer = newTrashPlayer();

// table for active player's data
var activePlayerDataTable;
var activeData;

// Places to print number of cards and points.
var deck_spot;
var points_spot;
var player_spot;
var gui_mode_spot;

var started = false;
var solitaire = null;
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

var game_offer = null;

var next_log_line_num = 1; // number for generating log line ID's

// Last time a status message was printed.
var last_status_print = 0;

// The last player who gained a card.
var last_gain_player = null;

// Track scoping of actions in play such as Watchtower.
var scopes = [];

// The version of the extension currently loaded.
var extension_version = 'Unknown';

// Tree is being rewritten, so should not process any tree change events
var rewritingTree = 0;

// Quotes a string so it matches literally in a regex.
RegExp.quote = function(str) {
  return str.replace(/([.?*+^$[\]\\(){}-])/g, "\\$1");
};

// Keep a map from plural to singular for cards that need it.
var plural_map = {};
for (var i = 0; i < card_list.length; ++i) {
  var card = card_list[i];
  if (card['Plural'] != card['Singular']) {
    plural_map[card['Plural']] = card['Singular'];
  }
}

// Keep a map from card name (singular or plural) to card description
var card_map = {};
for (i = 0; i < card_list.length; i++) {
  card = card_list[i];
  card_map[card.Singular] = card;
  card_map[card.Plural] = card;
  card.getActionCount = function() { return parseInt(this.Actions); };
  card.getBuyCount = function() { return parseInt(this.Buys); };
  card.getCoinCount = function() { return (this.Coins == "?" || this.Coins == "P" ? 0 : parseInt(this.Coins)); };
  card.getPotionCount = function() { return (this.Coins == "P" ? 1 : 0); };
  card.isAction = function() { return this.Action != "0"; }
}

var gameHasPotions = false;

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

  var isTrash = name == "Trash";

  this.num = num;
  if (isTrash) {
    this.idPrefix = "trash";
  } else {
    this.idPrefix = "player" + num;
  }
  if (name == "You") {
    this.classFor = "you";
  } else if (isTrash) {
    this.classFor = "trash";
  } else {
    this.classFor = "player" + (num % 2 == 0 ? "Even" : "Odd");
  }

  // Map from special counts (such as number of gardens) to count.
  if (isTrash) {
    this.special_counts = {};
    this.card_counts = {};
  } else {
    this.special_counts = { "Treasure" : 7, "Victory" : 3, "Uniques" : 2 };
    this.card_counts = { "Copper" : 7, "Estate" : 3 };
  }

  this.setIcon = function(imgNode) {
    this.icon = imgNode.cloneNode(true);
    this.icon.removeAttribute("class");
    this.icon.setAttribute("align", "top");
  }

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
  }

  this.getDeckString = function() {
    var str = this.deck_size;
    var need_action_string = (show_action_count && this.special_counts["Actions"]);
    var need_unique_string = (show_unique_count && this.special_counts["Uniques"]);
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
  }

  this.changeScore = function(points) {
    this.score = this.score + parseInt(points);
  }

  this.changeSpecialCount = function(name, delta) {
    if (this.special_counts[name] == undefined) {
      this.special_counts[name] = 0;
    }
    this.special_counts[name] = this.special_counts[name] + delta;
  }

  this.recordCards = function(name, count) {
    if (this.card_counts[name] == undefined || this.card_counts[name] == 0) {
      this.card_counts[name] = count;
      this.special_counts["Uniques"] += 1;
    } else {
      this.card_counts[name] += count;
    }

    if (this.card_counts[name] <= 0) {
      if (this.card_counts[name] < 0) {
        handleError("Card count for " + name + " is negative (" + this.card_counts[name] + ")");
      }
      delete this.card_counts[name];
      this.special_counts["Uniques"] -= 1;
    }

    var cardId = this.idFor(name);
    var cardCountCell = document.getElementById(cardId);
    if (cardCountCell) {
      cardCountCell.innerText = displayCardCount(this.card_counts[name]);
    }
  }

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
      if (type == "none" || type == "duration" || type == "action" || type == "reaction") {
        this.changeSpecialCount("Actions", count);
      } else if (type == "curse") {
        this.changeSpecialCount("Curse", count);
      } else if (type == "victory") {
        this.changeSpecialCount("Victory", count);
      } else if (type == "treasure") {
        this.changeSpecialCount("Treasure", count);
      } else {
        handleError("Unknown card class: " + card.className + " for " + card.innerText);
      }
    }
  }

  this.gainCard = function(card, count) {
    if (debug_mode) {
      $('#log').children().eq(-1).before('<div class="gain_debug">*** ' + name + " gains " + count + " " + card.innerText + "</div>");
    }
    // You can't gain or trash cards while possessed.
    if (possessed_turn && this == last_player) return;

    last_gain_player = this;
    count = parseInt(count);
    this.deck_size = this.deck_size + count;

    var singular_card_name = getSingularCardName(card.innerText);
    this.changeScore(pointsForCard(singular_card_name) * count);
    this.recordSpecialCards(card, count);
    this.recordCards(singular_card_name, count);
  }

  this.idFor = function(fieldName) {
    return this.idPrefix + "_" + toIdString(fieldName);
  }
}

function ActiveData() {
  this.reset = function() {
    this.actions = 1;
    this.buys = 1;
    this.coins = 0;
    this.potions = 0;
    this.played = 0;
  };
  
  this.prefixes = {coins: '$', potions: '◉'};
  
  this.changeField = function(key, delta) {
    this[key] += delta;
    this.displayField(key);
  }
  
  this.displayField = function(key) {
    if (key == 'potions' && !gameHasPotions) return;
    var prefix = this.prefixes[key];
    prefix = prefix || '';
    $('#active_' + key).text(prefix + this[key]);
  }

  this.display = function() {
    this.displayField('actions');
    this.displayField('buys');
    this.displayField('coins');
    this.displayField('potions');
    this.displayField('played');
  };

  this.playsCard = function(countIndicator, cardName, userAction) {
    var count = NaN;
    try {
      count = parseInt(countIndicator);
    } catch (err) {
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

    this.changeField('played', count); // this comes first because the value of some cards depends on it
    this.changeField('actions', count * card.getActionCount());
    if (userAction && card.isAction()) // consume the action
      this.changeField('actions', -count);
    this.changeField('buys', count * card.getBuyCount());
    this.changeField('coins', count * card.getCoinCount());
    this.changeField('potions', count * card.getPotionCount());
  };

  this.reset();
}

function newTrashPlayer() {
  var t = new Player('Trash', i);
  t.card_counts = {};
  t.classFor = "trash";
  t.deck_size = 0;
  t.score = 0;
  return t;
}

function stateStrings() {
  var state = '';
  for (var player in players) {
    player = players[player];
    state += '<b>' + player.name + "</b>: " +
        player.getScore() + " points [deck size is " +
        player.getDeckString() + "] - " +
        JSON.stringify(player.special_counts) + "<br>" +
        JSON.stringify(player.card_counts) + "<br>";
  }
  return state;
}

function getSingularCardName(name) {
  if (plural_map[name] == undefined) return name;
  return plural_map[name];
}

function getPlayer(name) {
  if (players[name] == undefined) return null;
  return players[name];
}

function findTrailingPlayer(text) {
  var arr = text.match(/ ([^\s.]+)\.[\s]*$/);
  if (arr == null) {
    handleError("Couldn't find trailing player: '" + text + "'");
    return null;
  }
  if (arr.length == 2) {
    return getPlayer(arr[1]);
  }
  return null;
}

function placeActivePlayerData() {
  if (last_player == null)
    return;
  
  var playerID = last_player.idFor("active");
  var cell = document.getElementById(playerID);
  if (cell == undefined)
    return;

  try {
    rewritingTree++;

    if (activePlayerDataTable == undefined) {
      activePlayerDataTable = document.createElement("table");
      addRow(activePlayerDataTable, undefined,
          '<td class="playerDataKey">Actions:</td>' + '<td id="active_actions" class="playerDataValue"></td>');
      addRow(activePlayerDataTable, undefined,
          '<td class="playerDataKey">Buys:</td>' + '<td id="active_buys" class="playerDataValue"></td>');
      addRow(activePlayerDataTable, undefined,
          '<td class="playerDataKey">Coins:</td>' + '<td id="active_coins" class="playerDataValue"></td>');
      $('#supply .supplycard[cardname="Potion"]').each(function() {
        gameHasPotions = true
      });
      if (gameHasPotions) {
        addRow(activePlayerDataTable, undefined,
            '<td class="playerDataKey">Potions:</td>' + '<td id="active_potions" class="playerDataValue"></td>');
      }
      addRow(activePlayerDataTable, undefined,
          '<td class="playerDataKey">Played:</td>' + '<td id="active_played" class="playerDataValue"></td>');
    }
    activeData.display();

    if (cell.firstElementChild != activePlayerDataTable) {
      cell.appendChild(activePlayerDataTable);
    }
  } finally {
    rewritingTree--;
  }
}

function removeActivePlayerData() {
  if (!activePlayerDataTable)
    return;
  var parent = activePlayerDataTable.parentNode;
  if (parent != null)
    parent.removeChild(activePlayerDataTable);
  activePlayerDataTable = undefined;
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

    return true;
  }
  return false;
}

function adjustActive(key, spec) {
  if (spec != null) 
    activeData.changeField(key, parseInt(spec[1]));
}

function maybeHandleActiveCounts(elems, text) {
  if (text.match(/ plays? /)) {
    var parts = text.split(/,|,?\s+and\b/);
    var elemNum = 0;
    for (var i = 0; i < parts.length; i++) {
      var match = /\b(an?|the|[0-9]+) (.*)/.exec(parts[i]);
      if (match == null) continue;
      var cardName = elems[elemNum++].innerText;
      activeData.playsCard(match[1], cardName, !text.match(/^\.\.\. /));
    }
    return elemNum > 0;
  }
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
  possessed_turn_backup = possessed_turn;
  possessed_turn = false;

  var ret = false;
  if (text.indexOf("it to the supply") != -1) {
    last_player.gainCard(last_reveal_card, -1);
    ret = true;
  } else {
    var arr = text.match("([0-9]*) copies to the supply");
    if (arr && arr.length == 2) {
      last_player.gainCard(last_reveal_card, -arr[1]);
      ret = true;
    }
  }

  possessed_turn = possessed_turn_backup;
  return false;
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

    var arr = text.match(new RegExp("trash(?:es)? (?:one of )?" + player_re + "'s"));
    if (arr && arr.length == 2) {
      getPlayer(arr[1]).gainCard(elems[0], -1);
      return true;
    }
    return false;
  }
}

function maybeHandleTournament(elems, text_arr, text) {
  if (elems.length == 2 && text.match(/and gains? a .+ on (the|your) deck/)) {
    getPlayer(text_arr[0]).gainCard(elems[1], 1);
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
  for (elem in elems) {
    if (elems[elem].innerText != undefined) {
      var card = elems[elem].innerText;
      var count = getCardCount(card, text);
      var num = multiplier * count;
      player.gainCard(elems[elem], num);
      if (num < 0) {
        trashPlayer.gainCard(elems[elem], -num);
      }
    }
  }
}

function isGameStart(nodeText) {
  if (solitaire == null) {
    if (game_offer != null) {
      solitaire = game_offer.innerText.match(/this game solitaire\?/) != null;
    }
    if (solitaire == null)
      return false;
  }


  if (solitaire) {
    return nodeText.match(/ turn 1 —$/);
  } else {
    return nodeText.indexOf("Turn order") >= 0;
  }
}

function maybeHandleGameStart(node) {
  var nodeText = node.innerText;
  if (nodeText == null || !isGameStart(nodeText))
    return false;
  initialize(node);
  ensureLogNodeSetup(node);
  
  // If this is a solitaire game, the turn start is also the "turn change' entry, so keep on processing to handle that
  return !solitaire;
}

function nextLogId() {
  var idNum = next_log_line_num + "";
  next_log_line_num++;
  while (idNum.length < 4)
    idNum = "0" + idNum;
  return "logLine" + idNum;
}

function ensureLogNodeSetup(node) {
  if (!node.id)
    node.id = nextLogId();
  node.addEventListener("DOMNodeRemovedFromDocument", reinsert);
}

function handleLogEntry(node) {
  if (maybeHandleGameStart(node)) return;
  
  if (!started)
    return;

  ensureLogNodeSetup(node);
  maybeRewriteName(node);

  if (maybeHandleTurnChange(node)) return;

  // Make sure this isn't a duplicate possession entry.
  if (node.className.indexOf("logline") < 0) return;

  var text = node.innerText.split(" ");

  // Keep track of what sort of scope we're in for things like watchtower.
  handleScoping(text, node.innerText);

  // Gaining VP could happen in combination with other stuff.
  maybeHandleVp(node.innerText);

  elems = node.getElementsByTagName("span");
  if (elems.length == 0) {
    if (maybeReturnToSupply(node.innerText)) return;
    return;
  }

  // Remove leading stuff from the text.
  var i = 0;
  for (i = 0; i < text.length; i++) {
    if (!text[i].match(/^[. ]*$/)) break;
  }
  if (i == text.length) return;
  text = text.slice(i);

  if (maybeHandleActiveCounts(elems, node.innerText)) return;

  if (maybeHandleMint(elems, node.innerText)) return;
  if (maybeHandleTradingPost(elems, node.innerText)) return;
  if (maybeHandleExplorer(elems, node.innerText)) return;
  if (maybeHandleSwindler(elems, node.innerText)) return;
  if (maybeHandlePirateShip(elems, text, node.innerText)) return;
  if (maybeHandleSeaHag(elems, text, node.innerText)) return;
  if (maybeHandleOffensiveTrash(elems, text, node.innerText)) return;
  if (maybeHandleTournament(elems, text, node.innerText)) return;

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
  var card = elems[0];
  var card_text = elems[0].innerText;

  var player = getPlayer(text[0]);
  var action = text[1];
  var delta = 0;
  if (action.indexOf("buy") == 0) {
    var count = getCardCount(card_text, node.innerText);
    player.gainCard(card, count);
    activeData.changeField('buy', -count);
  } else if (action.indexOf("pass") == 0) {
    possessed_turn_backup = possessed_turn;
    possessed_turn = false;
    if (possessed_turn && this == last_player) return;
    if (player_count != 2) {
      maybeAnnounceFailure(">> Warning: Masquerade with more than 2 players " +
                           "causes inaccurate score counting.");
    }
    player.gainCard(card, -1);
    var other_player = findTrailingPlayer(node.innerText);
    if (other_player == null) {
      handleError("Could not find trailing player from: " + node.innerText);
    } else {
      other_player.gainCard(card, 1);
    }
    possessed_turn = possessed_turn_backup;
  } else if (action.indexOf("receive") == 0) {
    possessed_turn_backup = possessed_turn;
    possessed_turn = false;
    player.gainCard(card, 1);
    var other_player = findTrailingPlayer(node.innerText);
    if (other_player == null) {
      handleError("Could not find trailing player from: " + node.innerText);
    } else {
      other_player.gainCard(card, -1);
    }
    possessed_turn = possessed_turn_backup;
  } else if (action.indexOf("reveal") == 0) {
    last_reveal_card = card;
  }
}

function getScores() {
  var scores = "Points: ";
  for (var player in players) {
    scores = scores + " " + player + "=" + players[player].getScore();
  }
  return scores;
}

function addRow(tab, playerClass, innerHTML) {
  var r = document.createElement("tr");
  if (playerClass)
    r.setAttribute("class", playerClass);
  tab.appendChild(r);
  r.innerHTML = innerHTML;
  return r;
}

function cardCountCellsForPlayer(player, cardName) {
  var cellId = player.idFor(cardName);
  if (!document.getElementById(cellId)) {
    return $('<td id="' + cellId + '">' + displayCardCount(player.card_counts[cardName]) + '</td>')
        .addClass("playerCardCountCol").addClass(player.classFor);
  } else {
    return null;
  }
}

function setupPerPlayerTextCardCounts() {
  var toAdd = player_count + 1; // the extra is for the trash player
  $("#supply > table > tbody > tr > td[colspan]").each(function() {
    var $this = $(this);
    var origSpanStr = $this.attr("colspan");
    var origSpan = parseInt(origSpanStr);
    $this.attr("colspan", (origSpan + toAdd) + "");
  });
  $(".txcardname").each(function() {
    var $this = $(this);
    var cardName = $this.children("[cardname]").first().attr('cardname');
    var $insertAfter = $this.next();
    allPlayers(function(player) {
      var cell = cardCountCellsForPlayer(player, cardName);
      if (cell != null) {
        $insertAfter.after(cell);
        $insertAfter = cell;
      }
    });
  });
}

function setupPerPlayerImageCardCounts(region) {
  var classSelector = '.' + region + '-column';

  // make "hr" rows span all columns
  $(classSelector + ' .hr:empty').append('<td colspan="' + (1 + player_count + 1) + '"></td>');

  $(classSelector + ' .supplycard').each(function() {
    var $this = $(this);
    var cardName = $this.attr('cardname');
    allPlayers(function(player) {
      var cell = cardCountCellsForPlayer(player, cardName);
      if (cell != null)
        $this.append(cell);
    });
  });
}

function allPlayers(func) {
  for (var playerName in players) {
    func(players[playerName]);
  }
  func(trashPlayer);
}

function displayCardCount(count) {
  return (count == 0 || count == undefined ? '-' : count);
}

function toIdString(name) {
  return name.replace(/[^a-zA-Z]/gi, "").toLowerCase();
}

function updateScores() {
  if (last_player == null) return;
  rewriteTree(function() {
    $("#" + last_player.idFor("score")).text(last_player.getScore());
  });
}

function setupPlayerArea() {
  try {
    rewritingTree++;

    var dataTable = document.createElement("table");
    dataTable.id = "playerData";
    if (!text_mode) {
      dataTable.setAttribute("align", "right");
    }
    for (var playerName in players) {
      var countBefore = dataTable.childNodes.length;
      var player = players[playerName];
      var row1 = addRow(dataTable, player.classFor,
          '<td id="' + player.idFor("active") + '" class="activePlayerData" rowspan="0"></td>' +
              '<td class="playerDataName" rowspan="0">' + playerName + '</td>' +
              '<td class="playerDataKey"> Score:</td>' + '<td id="' + player.idFor("score") +
              '" class="playerDataValue">' + player.getScore() + '</td>');
      var activeCell = row1.firstElementChild;
      var playerCell = activeCell.nextElementSibling;
      if (player.icon != undefined) {
        playerCell.insertBefore(player.icon.cloneNode(true), playerCell.firstChild);
      }
      addRow(dataTable, player.classFor,
          '<td class="playerDataKey">Deck:</td>' + '<td id="' + player.idFor("deck") + '" class="playerDataValue">' +
              player.getDeckString() + '</td>');
      var numRows = dataTable.childNodes.length - countBefore;
      activeCell.setAttribute("rowSpan", numRows);
      playerCell.setAttribute("rowSpan", numRows);
    }

    if (text_mode) {
      setupPerPlayerTextCardCounts();
    } else {
      setupPerPlayerImageCardCounts('kingdom');
      setupPerPlayerImageCardCounts('basic');
    }

    if (text_mode) {
      var outerTable = document.createElement("table");
      outerTable.id = "playerDataArranger";
      var row = addRow(outerTable, null, '<td id="playerDataContainer" valign="bottom"></td>' +
          '<td id="logContainer" valign="bottom"></td>');
      row.firstChild.appendChild(dataTable);
      row.lastChild.appendChild(document.getElementById("log"));
      var game = document.getElementById("game");
      game.insertBefore(outerTable, game.firstElementChild);
    } else {
      var tab = player_spot.firstElementChild;
      var nrow = tab.insertRow(0);
      var area = nrow.insertCell();
      nrow.setAttribute("align", "right");
      area.id = "playerData";
      area.setAttribute("colspan", "2");
      area.appendChild(dataTable);
    }
  } finally {
    rewritingTree--;
  }
}

function removePlayerArea() {
  var ptab = document.getElementById("playerData");
  if (ptab != null && ptab.parentNode != null) {
    removeActivePlayerData();
    ptab.parentNode.removeChild(ptab);
  }
  activePlayerDataTable = null;
}

function getDecks() {
  var decks = "Cards: ";
  for (var player in players) {
    decks = decks + " " + player + "=" + players[player].getDeckString();
  }
  return decks;
}

function updateDeck() {
  if (last_player == null) return;
  rewriteTree(function() {
    $("#" + last_player.idFor("deck")).text(last_player.getDeckString() + "");
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
  next_log_line_num = 3;

  last_gain_player = null;
  scopes = [];

  players = new Object();
  player_rewrites = new Object();
  player_re = "";
  player_count = 0;

  setGUIMode();
  activeData = new ActiveData();

  // Figure out what turn we are. We'll use that to figure out how long to wait
  // before announcing the extension.
  var self_index = -1;

  // Hack: collect player names with spaces and apostrophes in them. We'll
  // rewrite them and then all the text parsing works as normal.
  var p = "(?:([^,]+), )";    // an optional player
  var pl = "(?:([^,]+),? )";  // the last player (might not have a comma)
  var re = (solitaire ? /.* (You)r turn 1 .*/i : new RegExp("Turn order is "+p+"?"+p+"?"+p+"?"+pl+"and then (.+)."));
  var arr = doc.innerText.match(re);
  if (arr == null) {
    handleError("Couldn't parse: " + doc.innerText);
  }
  var other_player_names = [];
  var playerNum = 1;
  for (var i = 1; i < arr.length; ++i) {
    if (arr[i] == undefined) continue;

    player_count++;
    if (arr[i].match(/^you$/i)) {
      self_index = player_count;
      arr[i] = "You";
    }
    var rewritten = rewriteName(arr[i]);
    if (rewritten != arr[i]) {
      player_rewrites[arr[i]] = rewritten;
      arr[i] = rewritten;
    }
    // Initialize the player.
    players[arr[i]] = new Player(arr[i], playerNum++);

    if (arr[i] != "You") {
      other_player_names.push(RegExp.quote(arr[i]));
    }
  }
  player_re = '(' + other_player_names.join('|') + ')';

  setupPlayerArea();

  var wait_time = 200 * Math.floor(Math.random() * 10 + 5);
  if (self_index != -1) {
    wait_time = 300 * self_index;
  }
  console.log("Waiting " + wait_time + " to introduce " +
              "(index is: " + self_index + ").");
  setTimeout("maybeIntroducePlugin()", wait_time);
}

function maybeRewriteName(doc) {
  if (doc.innerHTML != undefined && doc.innerHTML != null) {
    for (player in player_rewrites) {
      doc.innerHTML = doc.innerHTML.replace(player, player_rewrites[player]);
    }
  }
}

function maybeIntroducePlugin() {
  if (!introduced) {
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
    disabled = true;
    deck_spot.innerHTML = "exit";
    points_spot.innerHTML = "faq";
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
  addSetting("always_display", settings);
  addSetting("allow_disable", settings);
  addSetting("name", settings);
  addSetting("status_announce", settings);
  addSetting("status_msg", settings);
  return JSON.stringify(settings);
}

function handleGameEnd(doc) {
  for (var node in doc.childNodes) {
    if (doc.childNodes[node].innerText == "game log") {
      // Reset exit / faq at end of game.
      started = false;
      deck_spot.innerHTML = "exit";
      points_spot.innerHTML = "faq";

      localStorage.removeItem("log");
      localStorage.removeItem("offer");
      solitaire = null;
      game_offer = null;
      text_mode = undefined;
      removePlayerArea();
      unsetGUIMode();

      // Collect information about the game.
      var href = doc.childNodes[node].href;
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
          var re = new RegExp(RegExp.quote(player_name) + " has ([0-9]+) points");
          var arr = summary.match(re);
          if (arr && arr.length == 2) {
            var score = ("" + players[player].getScore()).replace(/^.*=/, "");
            if (score.indexOf("+") != -1) {
              score = ("" + players[player].getScore()).replace(/^([0-9]+)\+.*/, "$1");
            }
            if (has_correct_score && arr[1] != score) {
              has_correct_score = false;
              optional_state_strings = stateStrings();
              break;
            }
          }
        }
      }

      // Post the game information to app-engine for later use for tests, etc.
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
 * This event handler is called when a logline node is being removed. We don't want log lines removed, so when this
 * happens, we insert another copy of the node into the parent to take its place. This copy will remain behind after
 * the original node is actually removed (which comes after the event notification phase).
 */
function reinsert(ev) {
  if (!started) // the game may have ended
    return;

  var node = ev.target;
  var next = node.nextElementSibling;
  var prev = node.previousElementSibling;
  var duplicated = (next != undefined && next.id == node.id) || (prev != undefined && prev.id == node.id);
  if (!duplicated) {
    var copy = node.cloneNode(true);
    copy.removeAttribute("style"); // the "fading" of old log messages reduces opacity to near zero; clear that
    try {
      rewritingTree++;
      node.parentNode.insertBefore(copy, node);
    } finally {
      rewritingTree--;
    }
  }
}

var pending_logs = [];

function maybeStartOfGame(node) {
  var nodeText = node.innerText.trim();

  // store up blank lines at the beginning; we don't know yet whether we're reloading or starting a new game
  if (nodeText.length == 0) {
    pending_logs.push(node);
    return;
  }

  // The first line of actual text is either the game starting value or something in the middle of the game
  if (isGameStart(nodeText)) {
    // The game is starting, so put in the initial blank entries and clear out any local storage
    console.log("--- starting game ---" + "\n");
    started = true;
    next_log_line_num = 1;
    localStorage.removeItem("log");
    while (pending_logs.length > 0) {
      handleLogEntry(pending_logs.shift());
    }
  } else {
    restoreHistory(node);
    started = true;
  }
  pending_logs = [];
}

function isTallLogEntry(node) {
  // this is only called when we already know it is a log entry of some kind
  return (node.firstElementChild && node.firstElementChild.attributes['style']);
}

// / returns true if the log node should be handled as part of the game
function logEntryForGame(node) {
  if (isTallLogEntry(node)) {
    pending_logs = [node];
    return false;
  }

  if (inLobby()) {
    if (pending_logs.length > 0)
      pending_logs = [];
    return false;
  }

  if (!started)
    maybeStartOfGame(node);
  return started;
}

function restoreOffer() {
  var offer = document.createElement("span");
  offer.innerHTML = localStorage["offer"];
  return offer;
}

function restoreHistory(node) {
  // The first log line is no the first line of the game, so restore the log from history
  // Of course, there must be a log history to restore
  var logHistory = localStorage["log"];
  game_offer = restoreOffer();
  if (logHistory == undefined || logHistory.length == 0)
    return;

  console.log("--- restoring log ---" + "\n");
  // First build a DOM tree of the old log messages in a copy of the log parent node.
  var storedLog = node.parentNode.cloneNode(false);
  storedLog.innerHTML = logHistory;

  // Write all the entries from the history into the log up to (but not including) the one
  // that matches the newly added entry that triggered the need to restore the history.
  try {
    rewritingTree++;
    var logRegion = node.parentElement;
    // first, clear out anything that's currently there before the newly added entry
    while (logRegion.hasChildNodes() && logRegion.firstChild != node)
      logRegion.removeChild(logRegion.firstChild);
    var newLogEntryInner = node.innerHTML;
    while (storedLog.hasChildNodes()) {
      var line = storedLog.removeChild(storedLog.firstChild);
      // The way we avoid logs going away is to put them back in when they go away. So a stored log can 
      // capture both log nodes -- the replacement and the fading original. So we have to make sure that 
      // the log entry hasn't already been handled.
      if (document.getElementById(line.id) != undefined)
        continue;

      // this might be the "faded" version with low opacity, so remove that
      var style = line.getAttribute("style");
      if (style && style.indexOf("opacity") >= 0)
        line.removeAttribute("style");

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
  } finally {
    rewritingTree--;
  }
}

function inLobby() {
  // In the lobby there is no real supply region -- it's empty
  return (player_spot == undefined || player_spot.childElementCount == 0);
}

function unsetGUIMode() {
  document.firstChild.id = "";
  $("#body").removeClass("textMode").removeClass("imageMode").removeClass("playing");
}

function setGUIMode() {
  var href = gui_mode_spot.getAttribute("href");
  // The link is to the "text" mode when it's in image mode and vice versa
  text_mode = href.indexOf("text") < 0;

  // setting the html id lets us write css selectors that distinguish between the modes
  $("#body").addClass("playing").addClass(text_mode ? "textMode" : "imageMode");  
}

function rewriteTree(func) {
  try {
    rewritingTree++;
    func();
  } finally {
    rewritingTree--;
  }
}

function handle(doc) {
  if (rewritingTree > 0) {
    return;
  }

  try {
    if (doc.constructor == HTMLDivElement &&
        doc.innerText.indexOf("Say") == 0) {
      var links = doc.getElementsByTagName("a");
      gui_mode_spot = links[0];
      deck_spot = links[1];
      points_spot = links[2];
    }
    
    if (!started) {
      var choices = document.getElementById("choices");
      if (choices != null && choices.hasChildNodes()) {
        var spans = choices.getElementsByTagName("SPAN");
        for (var i = 0; i < spans.length; i++) {
          var txt = spans[i].innerText;
          if (txt.indexOf("play this game ") == 0) {
            game_offer = spans[i];
            localStorage["offer"] = game_offer.innerHTML; // preserve it -- this is critical when restoring the log
            break;
          }
        }
      }
    }

    if (doc.className && doc.className.indexOf("logline") >= 0) {
      if (logEntryForGame(doc)) {
        handleLogEntry(doc);
        if (started) {
          localStorage["log"] = doc.parentElement.innerHTML;
        }
      }
    }

    if (doc.id == "supply") {
      player_spot = doc;
    }

    if (doc.parentNode.id == "supply") {
      show_action_count = false;
      show_unique_count = false;
      show_duchy_count = false;
      elems = doc.getElementsByTagName("span");
      for (var elem in elems) {
        if (elems[elem].innerText == "Vineyard") show_action_count = true;
        if (elems[elem].innerText == "Fairgrounds") show_unique_count = true;
        if (elems[elem].innerText == "Duke") show_duchy_count = true;
      }
    }

    if (!started) return;

    if (doc.constructor == HTMLDivElement && doc.parentNode.id == "choices") {
      handleGameEnd(doc);
      if (!started) return;
    }

    if (doc.parentNode.id == "chat" && doc.childNodes.length > 2) {
      handleChatText(doc.childNodes[1].innerText.slice(0, -1),
                     doc.childNodes[2].nodeValue);
    }

    if (localStorage["always_display"] != "f") {
      if (!disabled) {
        updateScores();
        updateDeck();
      }
    }
  }
  catch (err) {
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
  if (localStorage["status_announce"] == "t" &&
      $('#lobby').length != 0 && $('#lobby').css('display') != "none") {
    // Set the original status message.
    writeText(buildStatusMessage());

    // Handle updating status message as needed.
    $('#entry').css('display', 'none');
    $('#entry').after('<input id="fake_entry" class="entry" style="width: 350px;">');
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

  $('#tracker').attr('checked', true).attr('disabled', true)
  $('#autotracker').val('yes').attr('disabled', true);
}
setTimeout("enterLobby()", 600);

document.body.addEventListener('DOMNodeInserted', function(ev) {
  handle(ev.target);
});

chrome.extension.sendRequest({ type: "version" }, function(response) {
  extension_version = response;
});
