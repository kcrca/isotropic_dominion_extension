function SelfTests() {
  var infoIsForTests = false;

  this.testOnlyMyScore = false;

  this.reset = function() {
    this.testOnlyMyScore = false;
  };

  function markInfoAsOurs(table) {
    table.parent().addClass('internalInfoPage');
    var row = $('<tr/>');
    var col = $('<td/>').attr('colspan', '2');
    table.append(row);
    row.append(col.html('This info window is for internal testing purposes. ' +
        'It should have been dismissed automatically without you seeing it. ' +
        'If you see this, please dismiss it and let us know.'));
  }

  this.maybeRunInfoWindowTests = function(table) {
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
      logDebug('click', 'removing info window');
      $("body > div.black").remove();
      logDebug('click', 'removed info window');
    }
  };

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
          if (this.testOnlyMyScore && player.name != "You") return;
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

  this.startInfoWIndowTests = function() {
    // Should not run these tests while restoring from log.
    if (!restoring_log && pending_log_entries < 0) {
      infoIsForTests = true;
      logDebug('click', 'clicking on info button');
      $('button:contains(info)').click();
    }
  };

  this.reset();
}
