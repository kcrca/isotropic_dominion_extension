// For players who have spaces in their names, a map from name to name
// rewritten to have underscores instead. Pretty ugly, but it works.
var player_rewrites = new Object();

// Map from player name to Player object.
var players = undefined;
// Regular expression that is an OR of players other than "You".
var player_re = "";
// Count of the number of players in the game.
var player_count = 0;

// pseudo-player for Trash card counts
var tablePlayer;

// Map that contains the cards in the supply piles; other cards need to be shown
// shown in other ways.
var supplied_cards;

var started = false;
var introduced = false;
var i_introduced = false;
var disabled = false;
var had_error = false;
var show_action_count = false;
var show_unique_count = false;
var show_victory_count = false;
var show_duchy_count = false;
var possessed_turn = false;
var announced_error = false;

// Tree is being rewritten, so should not process any tree change events.
var rewritingTree = 0;

// Enabled by debugger when analyzing game logs.
var debug_mode = false;

var last_player = null;
var last_reveal_player = null;
var last_reveal_card = null;

var turn_number = 0;

// Last time a status message was printed.
var last_status_print = 0;

// The last player who gained a card.
var last_gain_player = null;

// Track scoping of actions in play such as Watchtower.
var scopes = [];

// The version of the extension currently loaded.
var extension_version = 'Unknown';

var restoring_log = false;

var infoIsForTests = false;

var test_only_my_score = false;

var view = createView();

var chatCommands = {};

var debug = {'actvData': false, 'infoData': true, 'logShown': true };

// Quotes a string so it matches literally in a regex.
RegExp.quote = function(str) {
  return str.replace(/([.?*+^$[\]\\(){}-])/g, "\\$1");
};

// Returns an html encoded version of a string.
function htmlEncode(value) {
  return $('<div/>').text(value).html();
}

function rewriteName(name) {
  return name.replace(/ /g, "_").replace(/'/g, "’").replace(/\./g, "");
}

function createView() {
  return new HtmlView();
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

  var card = card_map[card_name];
  return card.getVP();
}

function Player(name, num) {
  this.name = name;
  this.num = num;
  this.score = 3;
  this.deck_size = 10;

  this.isTable = name == "";

  // Map from special counts (such as number of gardens) to count.
  this.special_counts = { "Treasure" : 7, "Victory" : 3, "Uniques" : 2 };
  this.card_counts = { "Copper" : 7, "Estate" : 3 };

  if (this.isTable) {
    this.special_counts = {};
    this.card_counts = {};
    this.deck_size = 0;
    this.score = 0;
  }

  this.updateScore = function() {
    view.set(this, 'score', this.getScore());
  };

  this.updateDeck = function() {
    view.set(this, 'deck', this.getDeckString());
  };

  this.getScore = function() {
    var score_str = this.score + "";
    var total_score = this.score;

    if (this.special_counts["Gardens"] != undefined) {
      var gardens = this.special_counts["Gardens"];
      var garden_points = Math.floor(this.deck_size / 10);
      score_str = score_str + "+" + gardens + "g@" + garden_points;
      total_score = total_score + gardens * garden_points;
    }

    if (this.special_counts["Silk Roads"] != undefined) {
      var silk_roads = this.special_counts["Silk Roads"];
      var silk_road_points = 0;
      if (this.special_counts["Victory"] != undefined) {
        silk_road_points = Math.floor(this.special_counts["Victory"] / 4);
      }
      score_str = score_str + "+" + silk_roads + "s@" + silk_road_points;
      total_score = total_score + silk_roads * silk_road_points;
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

    if (score_str.indexOf('@') >= 0) {
      score_str = score_str + "=" + total_score;
    }
    return score_str;
  }

  this.getDeckString = function() {
    var str = this.deck_size;
    var need_action_string = (show_action_count && this.special_counts["Actions"]);
    var need_unique_string = (show_unique_count && this.special_counts["Uniques"]);
    var need_victory_string = (show_victory_count && this.special_counts["Victory"]);
    var need_duchy_string = (show_duchy_count && this.special_counts["Duchy"]);
    if (need_action_string || need_unique_string || need_duchy_string || need_victory_string) {
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
      if (need_victory_string) {
        special_types.push(this.special_counts["Victory"] + "v");
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
        maybeAnnounceFailure("Card count for " + name + " is negative (" + this.card_counts[name] + ")");
      }
      delete this.card_counts[name];
      this.special_counts["Uniques"] -= 1;
    }
    view.recordCard(this, name);
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
    if (name.indexOf("Silk Road") == 0) {
      this.changeSpecialCount("Silk Roads", count);
    }

    var types = card.className.split("-").slice(1);
    for (var type_i in types) {
      var type = types[type_i];
      if (type == "none" || type == "duration" ||
          type == "action" || type == "reaction") {
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

  this.gainCard = function(card, count, trashing) {
    if (debug_mode) {
      $('#log').children().eq(-1).before(
          '<div class="gain_debug">*** ' + name + " gains " +
          count + " " + card.innerText + "</div>");
    }

    last_gain_player = this;
    count = parseInt(count);
    this.deck_size = this.deck_size + count;

    var singular_card_name = getSingularCardName(card.innerText);
    this.changeScore(pointsForCard(singular_card_name) * count);
    this.recordSpecialCards(card, count);
    this.recordCards(singular_card_name, count);

    trashing = trashing == undefined ? true : trashing;

    // If the count is going down, usually player is trashing a card.
    if (!this.isTable && count < 0 && trashing) {
      tablePlayer.gainCard(card, -count);
    }

    view.gainCard(this, card, count, trashing);
  };

  // This player has resigned; remember it.
  this.setResigned = function() {
    if (this.resigned) return;
    view.setResigned(this);
    this.resigned = true;
  };

  view.setupPlayer(this);
}

function htmlToText(html) {
  return $('<span/>').html(html).text()
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
  return card_map[name].Singular;
}

function getPlayer(name) {
  if (players[name] == undefined) return null;
  return players[name];
}

function tempSayChange() {
  var clones = $('#temp_say').contents().clone();
  var copy = $('#copied_temp_say');

  rewriteTree(function () {
    copy.empty();
    copy.append(clones);
  });
}

function createFullLog() {
// Create the visible full log blob and hide the normal log part.
  rewriteTree(function () {
    // Remove any pre-existing node.
    $('#full_log').remove();

    var full_log = $('<pre id="full_log"/>');
    $('#log').hide().before(full_log);
    var temp_say = $('#temp_say');
    var copied_temp_say = temp_say.clone();
    copied_temp_say.attr('id', 'copied_temp_say');
    full_log.append(copied_temp_say);
    temp_say.bind('DOMSubtreeModified', tempSayChange);
  });
}

function maybeAddToFullLog(node) {
  $('#copied_temp_say').before($(node).clone());
}

function putBackRealLog() {
  // All children -- other things are there to be correctly located with log.
  $('#header').after($('#logContainer').children());
  $('#log').show();
  $('#full_log').remove();
}

function findTrailingPlayer(text) {
  var arr = text.match(/ ([^\s.]+)\.[\s]*$/);
  if (arr == null || arr.length != 2) {
    handleError("Couldn't find trailing player: '" + text + "'");
    return null;
  }
  return getPlayer(arr[1]);
}

function maybeHandleTurnChange(node) {
  var text = node.innerText;
  if (text.indexOf("—") != -1) {
    if ($.isEmptyObject(supplied_cards)) {
      // Figure out which cards are in supply piles.
      // Done here because if we're in veto mode the supply piles don't exist,
      // they are only guaranteed to exist on the first turn.
      $("#supply [cardname]").each(function() {
        supplied_cards[$(this).attr("cardname")] = true;
      });
      view.suppliedCardsKnown();
    }

    view.beforeTurn();

    var maybe_number = text.match(/([0-9]+) —/);
    if (maybe_number) turn_number = maybe_number[1];

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

    possessed_turn = text.match(/\(possessed by .+\)/);

    view.startTurn(node);

    if (debug_mode) {
      var details = " (" + getDecks() + " | " + getScores() + ")";
      node.innerHTML.replace(" —<br>", " " + details + " —<br>");
    }

    return true;
  }
  return false;
}

// Check to see if the node shows that a player resigned.
function maybeHandleResignation(node) {
  if (node.innerText.match(/ resigns? from the game/)) {
    last_player.setResigned();
    return true;
  }
  return false;
}

function markInfoAsOurs(table) {
  table.parent().addClass('internalInfoPage');
  var row = $('<tr/>');
  var col = $('<td/>').attr('colspan', '2');
  table.append(row);
  row.append(col.html('This info window is for internal testing purposes. ' +
      'It should have been dismissed automatically without you seeing it. ' +
      'If you see this, please dismiss it and let us know.'));
}

function maybeRunInfoWindowTests(table) {
  if (!infoIsForTests) return;

  // Make sure the table we're looking at is the info table
  if (table.tagName != 'TABLE') return;
  if (table.innerText.indexOf("Trash:") < 0) return;

  try {
    table = $(table);
    markInfoAsOurs(table);
    infoWindowTests(table);
  } finally {
    infoIsForTests = false;
    $("body > div.black").remove();
  }
}

function infoWindowTests(table) {
  // Our checks will definitely fail in an erroneous state.
  if (announced_error) return;

  if ($('#choices span.stash-pos-marker').length > 0) {
    // This check exists because it is possible to have the info window pop up
    // when the user is being asked where to locate the Stash card in the deck.
    // When that happens, the info window is incorrect (it doesn't show the
    // cards already drawn before the shuffle). This means that we cannot tell
    // how big the deck is, even if we count the number of cards shown in the
    // span choice. This is rare, so we just skip the tests in this case.
    logDebug('infoData',
        "--- Skipping info window tests during stash placement\n");
    return;
  }

  logDebug('infoData', "--- Running info tests ---\n");

  var msgs = [];
  var foundProblem = false;

  function checkValue(actual, expected, text) {
    var valid = (actual == expected);
    var label;
    var op;
    if (valid) {
      label = 'valid';
      op = '==';
    } else {
      label = '==INVALID==';
      op = '!=';
      foundProblem = true;
    }
    var msg = label + ': ' + actual + ' ' + op + ' ' + expected + ' ' +
        player.name + ': ' + text;
    logDebug('infoData', msg);
    msgs.push(msg);
  }

  function countCards(str) {
    if (str == 'nothing') {
      return 0;
    }
    var sep = /(?:,\s*|,?\s*\band\b\s*)+/g;
    var split = str.split(sep);
    logDebug('infoDataDetailed', 'pattern: ' + sep);
    logDebug('infoDataDetailed',
        'split ' + split.length + ': |' + split.join('|') + '|');
    var count = split.length;
    for (var i = 0; i < split.length; i++) {
      var cardSpec = split[i];
      var match = cardSpec.match(/^\d+/);
      if (match) {
        count += parseInt(match[0]) - 1;
      }
    }
    return count;
  }

  function addToCardCount(count) {
    if (isNaN(player.testCardCount)) return;
    player.testCardCount += count;
    if (player.testCardCountStr.length > 0) {
      player.testCardCountStr += '+';
    }
    player.testCardCountStr += count;
  }

  function parseInfoNumber(str) {
    return str == 'nothing' ? 0 : parseInt(str);
  }

  function setCurrentPlayer(p) {
    player = p;
    player.testCardCount = 0;
    player.testCardCountStr = '';
    player.testSeenIslandMat = false;
  }

  var player = tablePlayer;
  setCurrentPlayer(tablePlayer);

  var tests = [
    { pat: /^Trash: *\(?(nothing|\d+)/,
      act: function(row, match) {
        var count = parseInfoNumber(match[1]);
        checkValue(count, tablePlayer.deck_size, row.text());
      }
    },
    { pat: /^—— (.*) ——/,
      act: function(row, match) {
        var playerName = rewriteName(match[1]);
        setCurrentPlayer(getPlayer(playerName));
      }
    },
    { pat: /Current score: *([0-9]+)/,
      act: function(row, match) {
        // The score isn't reliable if we've had an error.
        if (test_only_my_score && player.name != "You") return;
        // Depends on the player.get() method which isn't universally supported.
        if (!player.get) return;
        var scoreStr = player.get('score');
        var equals = scoreStr.indexOf('=');
        if (equals > 0) {
          scoreStr = scoreStr.substring(equals + 1);
        }
        checkValue(parseInt(match[1]), parseInt(scoreStr), row.text());
      }
    },
    { pat: /^(Hand|Play area|Previous duration): *([^\d].*)/,
      act: function(row, match) {
        if (!view.tests.handSize) return;
        addToCardCount(countCards(match[2]));
        if (match[1].indexOf('Previous duration') == 0) {
          // Each Haven in the duration implies one *or more* cards set aside.
          // These cards are not listed in the info window, even for you. Which
          // means that if there are Havens, we can't really tell how many cards
          // are in the decks. (It can be more than one card if Haven was played
          // with Throne Room or King's Court.)
          if (match[2].match(/\bHaven\b/g)) {
            player.testCardCount = NaN;
            player.testCardCountStr = 'Haven prevents deck size test';
          }
        }
      }
    },
    { pat: /^(.*) (?:mat|aside): *(.*)/,
      act: function(row, match) {
        if (!view.tests.handSize) return;
        // Test set for the mat/aside area (includes chapel for thinning):
        // haven, horse traders, library, possession, island, native village, pirate ship, trade route, chapel
        // Island mat (also uses the term "aside" in the text)
        // Native Village mat (also uses the term "aside" in the text)
        // Pirate Ship mat
        // Trade Route mat
        // aside: Haven
        // aside: Horse Traders (reaction)
        // aside: Library (only during the turn)
        // aside: Possession (only during the turn)
        var count = countCards(match[2]);
        if (match[1] == 'Pirate Ship') {
          //!! We should count and show pirate ship mat tokens
        } else {
          if (match[1] == "Island") {
            checkValue(count, player.islandMatCount(), row.text());
            player.testSeenIslandMat = true;
          }
          addToCardCount(count);
        }
      }
    },
    { pat: /^(?:Hand|Draw pile): *(nothing|\d+)/,
      act: function(row, match) {
        if (!view.tests.handSize) return;
        addToCardCount(parseInfoNumber(match[1]));
      }
    },
    { pat: /^(Draw|Discard) pile:/,
      act: function(row, match) {
        if (!view.tests.handSize) return;
        var isDiscard = (match[1] == "Discard");
        var count = 0;
        var paddingStrs = '';
        $(row).find('span.discards').each(function() {
          var paddingSpec = $(this).css('padding-left');
          if (paddingStrs.length > 0) {
            paddingStrs += '+';
          }
          match = paddingSpec.match(/([0-9]+)px/);
          if (match) {
            paddingStrs += match[1];
            count += parseInt(match[1]) / 6;
          }
        });
        addToCardCount(count);
        player.testCardCountStr += '[' + paddingStrs + 'px]';
        if (isDiscard && !isNaN(player.testCardCount)) {
          if (!player.testSeenIslandMat) {
            // The info window is can be silent about the island mat for other
            // players so we have to expect the deck to include what's on the
            // mat, even though it hasn't been listed.
            player.testCardCount += player.islandMatCount()
          }
          checkValue(player.testCardCount, player.deck_size,
              player.testCardCountStr);
        }
      }
    }
  ];

  table.find('tr').each(function() {
    var tr = $(this);
    var text = tr.text().replace(/\s+/g, ' ');
    for (var i = 0; i < tests.length; i++) {
      var test = tests[i];
      var match = test.pat.exec(text);
      if (match) {
        test.act(tr, match);
        break;
      }
    }
  });

  if (foundProblem && debug['infoData']) {
    alert("Found problems with data: see console log");
  }
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
    var re = new RegExp("(?:You|" + player_re + ") (?:play|buy)s? an? ([^.]*)\\.");
    var arr = text.match(re);
    if (arr && arr.length == 3) {
      scope = arr[2];
    }
  }
  scopes.push(scope);
}

function maybeReturnToSupply(text) {
  return unpossessed(function () {
    var ret = false;
    if (text.indexOf("it to the supply") != -1) {
      last_player.gainCard(last_reveal_card, -1, false);
      ret = true;
    } else {
      var arr = text.match("([0-9]*) copies to the supply");
      if (arr && arr.length == 2) {
        last_player.gainCard(last_reveal_card, -arr[1], false);
        ret = true;
      }
    }
    return ret;
  });
}

function maybeHandleGainInHand(elems, text) {
  // Normally, "Bob gains a Gold in hand" means that Bob gets a new Gold.
  // But if Alice is currently possessing Bob, and uses a card like Mine to
  // trash a Silver to replace it with a Gold in the hand, we will see a message
  // like "Bob gains a Gold in hand". This doesn't mean that Bob gets a new
  // Gold, it actually means "A Gold is put into Bob's hand". A following
  // message will say who literally gets the new Gold: "... Alice gains the
  // Gold". So during Possession, "gains [...] in hand" doesn't mean "gain"
  // in the same way as everywhere else.
  if (!possessed_turn && text.match(/gain(ing)? a (.*) in (your )?hand/)) {
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
  return false;
}

function maybeHandleTournament(elems, text_arr, text) {
  if (elems.length == 2 && text.match(/and gains? a .+ on (the|your) deck/)) {
    getPlayer(text_arr[0]).gainCard(elems[1], 1);
    return true;
  }
  return false;
}

function maybeHandleTrader(elems, text_arr, text) {
  if (elems.length == 3 && text.match(/a Trader to gain a Silver/)) {
    getPlayer(text_arr[0]).gainCard(elems[2], -1);
    return true;
  }
  return false;
}

function maybeHandleGainViaReveal(elems, text_arr, text) {
  if (elems.length == 2 && text.match(/reveal(ing|s)? an? (.*) and gain(ing|s)? an? (.*)\./)) {
    var player = getPlayer(text_arr[0]);
    if (!player) player = last_player;
    player.gainCard(elems[1], 1);
    return true;
  }
  return false;
}

function maybeHandleNobleBrigand(elems, text_arr, text) {
  if (text.match(/draws? and reveals?.+, trashing a/)) {
    getPlayer(text_arr[0]).gainCard(elems[elems.length - 1], -1);
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
        // If Thief is used to gain the trashed card, take it back out
        if (text.match(/ gain(s|ed)? the trashed /) ||
            topScope() == "Noble Brigand") {
          tablePlayer.gainCard(elems[elem], -num);
        }
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
  maybeAddToFullLog(node);
  return true;
}

// Perform a function that should behave the same whether or not the current
// player is possessed.
function unpossessed(action) {
  // Remember the current state of possession.
  var originallyPossessed = possessed_turn;
  try {
    possessed_turn = false;
    return action();
  } finally {
    possessed_turn = originallyPossessed;
  }
}

function startInfoWIndowTests() {
  // Should not run these tests while restoring from log.
  if (!restoring_log) {
    infoIsForTests = true;
    $('button:contains(info)').click();
  }
}

function maybeOfferToPlay(node) {
  var innerText = node.innerText;
  if (innerText && innerText.indexOf("play this game ") == 0) {
    // If you get an offer to play a game, you aren't in the middle of one.
    removeStoredLog();
    return true;
  }
  return false;
}

var last_summary = '';

// If we're logging info data, write into the log the current info state, which
// is the same info as if a user typed "!all", but we put it in the log, not the
// chat stream.
function showCurrentInfo() {
  if (!debug['infoData']) return;
  var summary = '';
  showStatus('all', function(msg) {
    summary += msg + "\n";
  });
  if (summary != last_summary) {
    logDebug('infoData', summary);
    last_summary = summary;
  }
}

function handleLogEntry(node) {
  // These are used for messages from the administrator, and should be ignored.
  if (node.innerText.indexOf("»»»") == 0) return;
  // Do not handle copied log entries.
  if (node.parentNode.id == 'full_log') return;

  logDebug('logShown', node.innerText);

  if (maybeHandleGameStart(node)) return;

  if (!started) return;

  try {
    // Ignore the purple log entries during Possession.
    // When someone is possessed, log entries with class "possessed-log"
    // describe the "possession". The other (normal) log entries describe the
    // actual game effect. So we ignore the "possessed" entries because they
    // are what is being commanded, not what is actually happening to the cards.
    // (For example, if you possess Alice, then in "possessed-log" entries, it
    // says "You play a Silver", but the actual game effect is as if Alice
    // played the Silver (that is, Alice, as a player, gets $2 more to work
    // with, it's just that you, not Alice, are deciding what to do with
    // that $2).
    if (possessed_turn && $(node).hasClass("possessed-log")) return;

    handlePlayLog(node);
  } finally {
    // make sure we are using the node after any rewrites
    maybeAddToFullLog(node);
    showCurrentInfo();
    view.handleLogDone();
  }
}

function handlePlayLog(node) {
  maybeRewriteName(node);

  if (maybeHandleTurnChange(node)) {
    startInfoWIndowTests();
    return;
  }
  if (maybeHandleResignation(node)) return;

  // Make sure this isn't a duplicate possession entry.
  if (node.className.indexOf("possessed-log") > 0) return;

  var text = node.innerText.split(" ");

  // Keep track of what sort of scope we're in for things like watchtower.
  handleScoping(text, node.innerText);

  // Gaining VP could happen in combination with other stuff.
  maybeHandleVp(node.innerText);

  var elems = node.getElementsByTagName("span");

  // Remove leading stuff from the text.
  var i = 0;
  for (i = 0; i < text.length; i++) {
    if (!text[i].match(/^[. ]*$/)) break;
  }
  if (i == text.length) return;
  text = text.slice(i);

  view.handleLog(elems, text, node.innerText);

  if (maybeHandleMint(elems, node.innerText)) return;
  if (maybeHandleTradingPost(elems, node.innerText)) return;
  if (maybeHandleGainInHand(elems, node.innerText)) return;
  if (maybeHandleSwindler(elems, node.innerText)) return;
  if (maybeHandlePirateShip(elems, text, node.innerText)) return;
  if (maybeHandleSeaHag(elems, text, node.innerText)) return;
  if (maybeHandleOffensiveTrash(elems, text, node.innerText)) return;
  if (maybeHandleTournament(elems, text, node.innerText)) return;
  if (maybeHandleTrader(elems, text, node.innerText)) return;
  if (maybeHandleGainViaReveal(elems, text, node.innerText)) return;
  if (maybeHandleNobleBrigand(elems, text, node.innerText)) return;

  if (elems.length == 0) {
    if (maybeReturnToSupply(node.innerText)) return;
    return;
  }

  if (text[0] == "trashing") {
    var player = last_player;
    if (topScope() == "Watchtower") {
      player = last_gain_player;
    }
    return handleGainOrTrash(player, elems, node.innerText, -1);
  }
  if (text[1].indexOf("trash") == 0) {
    return handleGainOrTrash(getPlayer(text[0]), elems, node.innerText, -1);
  }
  if (text[0] == "gaining") {
    // When possessed, gaining a card (from, say, a University) is like
    // buying one -- it's the possessor, not the possessee, who gains it, which
    // is stated by a separate log message.
    if (possessed_turn) return;
    return handleGainOrTrash(last_player, elems, node.innerText, 1);
  }
  if (text[1].indexOf("gain") == 0) {
    return handleGainOrTrash(getPlayer(text[0]), elems, node.innerText, 1);
  }

  var player = getPlayer(text[0]);
  var action = text[1];

  // Handle revealing cards.
  if (action.indexOf("reveal") == 0) {
    last_reveal_player = player;
    last_reveal_card = elems[elems.length - 1];
  }

  // Expect one element from here on out.
  if (elems.length > 1) return;

  // It's a single card action.
  var card = elems[0];
  var card_text = elems[0].innerText;
  var card_obj = card_map[card_text];

  if (action.indexOf("buy") == 0) {
    var count = getCardCount(card_text, node.innerText);
    // In possessed turns, it isn't who buys something, it's who "gains" it
    // (and who gains it is stated in a separate log entry).
    if (!possessed_turn) {
      player.gainCard(card, count);
    }
    view.buy(count, card_obj);
  } else if (action.indexOf("pass") == 0) {
    unpossessed(function() {
      if (player_count > 2) {
        maybeAnnounceFailure("⚠ Warning: Masquerade with more than 2 players" +
            " causes inaccurate score counting.");
        test_only_my_score = true;
      }
      player.gainCard(card, -1, false);
      var other_player = findTrailingPlayer(node.innerText);
      if (other_player != null) {
        other_player.gainCard(card, 1);
      }
    });
  } else if (action.indexOf("receive") == 0) {
    unpossessed(function() {
      player.gainCard(card, 1);
      var other_player = findTrailingPlayer(node.innerText);
      if (other_player != null) {
        other_player.gainCard(card, -1, false);
      }
    });
  }
}

// Execute a function for all players, including the trash player.
function allPlayers(func) {
  for (var playerName in players) {
    func(players[playerName]);
  }
  if (tablePlayer) {
    func(tablePlayer);
  }
}

function topScope(skipping) {
  skipping = skipping || 0;
  for (var i = scopes.length - 1; i >= 0; i--) {
    var scope = scopes[i];
    if (scope && scope.length > 0) {
      if (--skipping < 0) return scopes[i];
    }
  }
  return undefined;
}

function findScope(name) {
  var top = scopes.length - 1;
  for (var i = top; i >= 0; i--) {
    if (scopes[i] == name) {
      return top - i;
    }
  }
  return -1;
}

function getScores() {
  var scores = "Points: ";
  for (var player in players) {
    scores = scores + " " + player + "=" + players[player].getScore();
  }
  return scores;
}

function updateScores() {
  view.updateScores();
}

function getDecks() {
  var decks = "Cards: ";
  for (var player in players) {
    decks = decks + " " + player + "=" + players[player].getDeckString();
  }
  return decks;
}

function updateDeck() {
  view.updateDeck();
}

function initialize(doc) {
  started = true;
  introduced = false;
  i_introduced = false;
  disabled = false;
  had_error = false;
  possessed_turn = false;
  announced_error = false;
  test_only_my_score = false;
  turn_number = 0;
  supplied_cards = {};

  last_gain_player = null;
  scopes = [];

  players = new Object();
  player_rewrites = new Object();
  player_re = "";
  player_count = 0;

  if (localStorage.getItem("disabled")) {
    disabled = true;
  }

  // Figure out what turn we are. We'll use that to figure out how long to wait
  // before announcing the extension.
  var self_index = -1;

  view = createView();

  //!! We need to also rewrite players named "you", "You", "Your", etc.
  // Hack: collect player names with spaces and apostrophes in them. We'll
  // rewrite them and then all the text parsing works as normal.
  var arr;
  if (doc.innerText == "Turn order is you.") {
    arr = [undefined, "you"];
  } else {
    var p = "(?:([^,]+), )";    // an optional player
    var pl = "(?:([^,]+),? )";  // the last player (might not have a comma)
    var re = new RegExp("Turn order is " + p + "?" + p + "?" + p + "?" + pl + "and then (.+).");
    arr = doc.innerText.match(re);
  }
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
      player_rewrites[htmlEncode(arr[i])] = htmlEncode(rewritten);
      arr[i] = rewritten;
    }
    // Initialize the player.
    players[arr[i]] = new Player(arr[i], player_count);

    if (arr[i] != "You") {
      other_player_names.push(RegExp.quote(arr[i]));
    }
  }
  player_re = '(' + other_player_names.join('|') + ')';

  // Create a new "player" representing the playing table, mostly the trash.
  tablePlayer = new Player('', i);

  if (!disabled) {
    updateScores();
    updateDeck();
  }

  // Assume it's already introduced if it's rewriting the tree for a reload.
  // Otherwise setup to maybe introduce the extension.
  if (!restoring_log) {
    var wait_time = 200 * Math.floor(Math.random() * 10 + 5);
    if (self_index != -1) {
      wait_time = 300 * self_index;
    }
    console.log("Waiting " + wait_time + " to introduce " +
        "(index is: " + self_index + ").");
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

function originalName(maybeRewrittenName) {
  for (var name in player_rewrites) {
    if (player_rewrites[name] == maybeRewrittenName) {
      return name;
    }
  }
  return maybeRewrittenName;
}

function chatCommandAvailable(request) {
  if (typeof(request) == 'string') {
    request = chatCommands[request];
  }
  return !request.checkAvailability || request.checkAvailability();
}

function writeHelp() {
  var inAll = [];
  for (var request in chatCommands) {
    var command = chatCommands[request];
    if (chatCommandAvailable(command)) {
      writeText('Type !' + request + ' to ' + command.help);
      if (!command.actionCommand) {
        inAll.push(request);
      }
    }
  }
  if (inAll.length > 1) {
    var last = inAll.length - 1;
    inAll[last] = 'and ' + inAll[last];
    var sep = (inAll.length == 2 ? ' ' : ', ');
    writeText('Type !all for ' + inAll.join(sep));
  }
}

function setupChatCommands() {
  chatCommands.status = {
    help: "see player score and deck info",
    execute: function(writeStatus) {
      writeStatus(getDecks() + " | " + getScores());
    }
  };
  chatCommands.disable = {
    checkAvailability: canDisable,
    actionCommand: true,
    help: "disable the point counter (by turn 5)",
    execute: function(writeStatus) {
      localStorage['disabled'] = "t";
      disabled = true;
      hideExtension();
      writeStatus("☠ Point counter disabled.");
    }
  };
  chatCommands.help = {
    actionCommand: true,
    help: 'show this list of commands',
    execute: writeHelp
  };
  view.addChatCommands();
}

function maybeIntroducePlugin() {
  if (!introduced && !disabled) {
    writeText("★ Game scored by Dominion Point Counter ★");
    writeText("http://goo.gl/iDihS");
    writeHelp();
  }
}

function maybeShowStatus(request, request_time) {
  if (!started) return;

  if (last_status_print < request_time) {
    last_status_print = new Date().getTime();
    showStatus(request, writeText);
  }
}

function showStatus(request, showFunc) {
  var my_name = localStorage["name"];
  if (my_name == undefined || my_name == null) my_name = "Me";

  showFunc = showFunc || writeText;
  function writeStatus(msg) {
    showFunc(">> " + msg.replace(/\bYou([:=])/g, my_name + "$1"));
  }

  if (request == 'all') {
    for (var name in chatCommands) {
      var subCommand = chatCommands[name];
      if (!subCommand.actionCommand && chatCommandAvailable(subCommand)) {
        subCommand.execute(writeStatus);
      }
    }
    return;
  }

  var command = chatCommands[request];
  if (!command) {
    showFunc("⚠ Unknown chat request: !" + request);
    return;
  }
  if (!chatCommandAvailable(command)) {
    showFunc("⚠ Chat request not available: !" + request);
    return;
  }
  command.execute(writeStatus);
}

function storeLog() {
  if (!debug_mode && !restoring_log) {
    localStorage["log"] = $('#full_log').html();
  }
}

function removeStoredLog() {
  localStorage.removeItem("log");
}

function hideExtension() {
  $('#log').show();
  $('#full_log').hide();
  $('#optionPanelHolder').hide();
  view.hide();
}

function canDisable() {
  return optionSet('allow_disable') && turn_number <= 5;
}

function handleChatText(speaker, text) {
  if (!text) return;
  if (disabled) return;

  var match = text.match(/^\s*!([^\s]+)/);
  if (match) {
    var time = new Date().getTime();
    var command = "maybeShowStatus('" + match[1] + "', " + time + ")";
    var wait_time = 200 * Math.floor(Math.random() * 10 + 1);
    // If we introduced the extension, we get first dibs on answering.
    if (i_introduced) wait_time = 100;
    setTimeout(command, wait_time);
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
    var child = doc.childNodes[node];
    if (child.innerText == "return") {
      // When the player clicks "return", notify the view to remove its data.
      child.addEventListener("DOMActivate", removePlayerData, true);
    } else if (child.innerText == "game log") {
      // Reset exit / faq at end of game.
      stopCounting();
      removeStoredLog();

      // Collect information about the game.
      var href = child.href;
      var game_id_str = href.substring(href.lastIndexOf("/") + 1);
      var name = localStorage["name"];
      if (name == undefined || name == null) name = "Unknown";

      // Double check the scores so we can log if there was a bug.
      var has_correct_score = true;
      var win_log = $('div.logline.em').prev()[0];
      if (!announced_error && win_log) {
        var summary = win_log.innerText;
        for (var player in players) {
          var player_name = players[player].name;
          if (player_name == "You") {
            player_name = rewriteName(name);
          }
          var re = new RegExp(RegExp.quote(player_name) + " has (-?[0-9]+) points");
          var arr = summary.match(re);
          if (arr && arr.length == 2) {
            var score = ("" + players[player].getScore()).replace(/^.*=/, "");
            if (score.indexOf("+") != -1) {
              score = ("" + players[player].getScore()).replace(/^([0-9]+)\+.*/, "$1");
            }
            if (has_correct_score && arr[1] != score) {
              has_correct_score = false;
              break;
            }
          }
        }
      }

      var printed_state_strings = stateStrings();

      // Post the game information to app-engine for later use for tests, etc.
      chrome.extension.sendRequest({
        type: "log",
        game_id: game_id_str,
        reporter: name,
        correct_score: has_correct_score,
        state_strings: printed_state_strings,
        log: document.body.innerHTML,
        version: extension_version,
        settings: settingsString() });
      break;
    }
  }
}

function removePlayerData() {
  putBackRealLog();
  view.remove();
  // Return true because this is used as an event handler.
  return true;
}

function stopCounting() {
  view.stop();
  started = false;
  removeStoredLog();
  $('#optionPanelHolder').show();
  players = undefined;
}

// If this connotes the start of the game, start it.
function maybeStartOfGame(node) {
  if (inLobby()) {
    // If we're in the lobby, this can't be the start of a game.
    // But if we have a stored log, that means that the last we knew, we were in 
    // the middle of a game in this same browser. Which means that we were
    // booted from the game for inactivity, or we hit exit, etc. In some cases
    // that would mean that when the user logged in they would be taken straight
    // to the still-in-progress game, but if the game is over, the server puts
    // us straight into the lobby. So if we are in the lobby but have a stored
    // log, we need to clean up.
    if (localStorage['log']) {
      removeStoredLog();
      removePlayerData();
    }
    return;
  }

  var nodeText = node.innerText.trim();
  if (nodeText.length == 0) {
    return;
  }

  if (localStorage.getItem("log") == undefined &&
      nodeText.indexOf("Your turn 1 —") != -1) {
    // We don't have any players but it's your turn 1. This must be a
    // solitaire game. Create a fake (and invisible) setup line. We'll get
    // called back again with it by the simple act of adding it (which is why
    // this code is *not* wrapped in rewriteTree()).
    console.log("Single player game.");
    node = $('<div class="logline" style="display:none;">' +
        'Turn order is you.</div>)').insertBefore(node)[0];
    return;
  }

  // The first line of actual text is either "Turn order" or something in
  // the middle of the game, in which case we restore the game from the log.

  createFullLog();
  if (nodeText.indexOf("Turn order") == 0) {
    // The game is starting, so put in the initial blank entries and clear
    // out any local storage.
    console.log("--- starting game ---");
    removeStoredLog();
    localStorage.removeItem("disabled");
    createFullLog();
  } else if (localStorage["log"]) {
    try {
      restoring_log = true;
      console.log("--- replaying history ---");
      disabled = localStorage['disabled'];
      if (!restoreHistory(node)) return;
    } finally {
      restoring_log = false;
    }
  } else {
    // It's some other situation, so we don't start the game
    return;
  }

  started = true;
}

// Returns true if the log node should be handled as part of the game.
function logEntryForGame(node) {
  if (inLobby()) {
    // If we're in the lobby and there is a log that means that a previou s game
    // in this same browser was ended, but upon logging back in, the server put
    // the user in the lobby. Which means the server dropped that game. So we
    // need to do that, and make sure that any remaining view-related behavior
    // is terminated.
    removeStoredLog();
    removePlayerData();
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
    return false;
  }

  createFullLog();

  // First build a DOM tree of the old log messages in a copy of the log.
  var log_entries = $('<pre id="temp"></pre>').html(logHistory).children();
  var full_log = $('#full_log');
  log_entries.each(function() {
    var entry = $(this);
    if (entry.html() == node.innerHTML) return false;
    handleLogEntry(entry[0]);
    return true;
  });
  return true;
}

function inLobby() {
  return $('#player_table').length > 0;
}

function addOptionHandler(name, updateVisibility) {
  var button = optionButtons[name];
  button.change(updateVisibility);
  button.change();
}

function addOptionControls(game) {
  var holder = $('<tr id="optionPanelHolder"/>');
  var controls = optionBuildControls('td', false);
  controls.attr('colspan', 2);
  holder.append(controls);
  game.after(holder);
  addOptionHandler('show_card_counts', function() {
    view.updateCardCountVisibility()
  });
  addOptionHandler('show_active_data', function() {
    view.updateShowActiveData();
  });
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
  // Ignore DOM events when we are rewriting the tree; see rewriteTree().
  if (rewritingTree > 0) return;

  // When the lobby screen is built, make sure point tracker settings are used.
  if (doc.className && doc.className == "constr") {
    $('#tracker').attr('checked', true).attr('disabled', true);
    $('#autotracker').val('yes').attr('disabled', true);
  }

  // Make sure the panel that shows the options is present.
  var game = $('#game');
  if (game.length > 0) {
    rewriteTree(function () {
      var optPanelHolder = $('#optionPanelHolder');
      if (optPanelHolder.length == 0) {
        addOptionControls(game);
      } else if (game.next()[0].id != optPanelHolder[0].id) {
        // If something has been added so it isn't where it should be, move it.
        game.after(optPanelHolder);
      }
    });
  }

  // We process log entries to the hidden log, copying them to the full log.
  // Don't process those copies.
  if (doc.parentNode.id == 'full_log') return;

  try {
    if (!started && maybeOfferToPlay(doc)) return;

    view.handle(doc);

    if (doc.parentNode.id == 'log') {
      if (logEntryForGame(doc)) {
        handleLogEntry(doc);
        if (started) {
          storeLog();
        }
      }
    }

    // The child nodes of "supply" tell us whether certain cards are in play.
    if (doc.parentNode.id == "supply") {
      show_action_count = false;
      show_unique_count = false;
      show_duchy_count = false;
      show_victory_count = false;
      var elems = doc.getElementsByTagName("span");
      for (var elem in elems) {
        if (elems[elem].innerText == "Vineyard") show_action_count = true;
        if (elems[elem].innerText == "Fairgrounds") show_unique_count = true;
        if (elems[elem].innerText == "Duke") show_duchy_count = true;
        if (elems[elem].innerText == "Silk Road") show_victory_count = true;
      }
    }

    if (!started) return;

    // If we're adding choices, it may be the choices at the end of the game
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

    maybeRunInfoWindowTests(doc);
  } catch (err) {
    console.log(err);
    console.log(doc);
    var error = '';
    if (doc.innerText != undefined) {
      error += "On '" + doc.innerText + "': ";
    }
    handleError("Javascript exception: " + err.stack);
  }
}

//
// Chat status handling.
//
setupChatCommands();

function buildStatusMessage() {
  var status_message = "/me Auto▼Count";
  if (localStorage["status_msg"] != undefined &&
      localStorage["status_msg"] != "") {
    status_message = status_message + " - " + localStorage["status_msg"];
  }
  return status_message;
}

function enterLobby() {
  if (optionSet('status_announce') &&
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

  view.enterLobby();
}

setTimeout("enterLobby()", 600);

function maybeUpdateTempSay(ev) {
  // Show the temp say dialogues if needed.
  if (ev.relatedNode && ev.relatedNode.id == 'temp_say') {
    var node = $(ev.relatedNode).clone();
    node.attr('id', 'copied_temp_say');
    node.css('color', '#36f');
    node.css('font-style', 'italic');
    node.css('margin-left', '50px');
    $('#copied_temp_say').remove();
    $('#full_log').append(node);
    return;
  }

  // Copy the new html text. If it gets blanked out we don't get an event.
  var temp_say = $('#temp_say');
  if (temp_say.length > 0) {
    $('#copied_temp_say').html(temp_say.html());
  }
}

document.body.addEventListener('DOMNodeInserted', function(ev) {
  maybeUpdateTempSay(ev);
  handle(ev.target);
});

chrome.extension.sendRequest({ type: "version" }, function(response) {
  extension_version = response;
});

function logDebug(area, msg) {
  if (debug[area]) {
    msg = msg.replace(/^/mg, area + ':');
    console.log(msg);
  }
}