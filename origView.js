function OrigView() {
  // Places to print number of cards and points.
  var deck_spot;
  var points_spot;

  this.hide = function() {
    if (deck_spot) deck_spot.innerHTML = "exit";
    if (points_spot) points_spot.innerHTML = "faq";
  }

  this.handle = function(doc) {
    // Detect the "Say" button so we can find some children
    if (doc.constructor == HTMLDivElement &&
        doc.innerText.indexOf("Say") == 0) {
      // Pull out the links for future reference.
      var links = doc.getElementsByTagName("a");
      deck_spot = links[1];
      points_spot = links[2];
    }
  };

  this.updateScores = function() {
    if (points_spot == undefined) {
      var spot = $('a[href="http://dominion.isotropic.org/faq/"]');
      if (spot.length != 1) return;
      points_spot = spot[0];
      return;
    }
    points_spot.innerHTML = getScores();
  };

  this.updateDeck = function(player) {
    if (deck_spot == undefined) {
      var spot = $('a[href="/signout"]');
      if (spot.length != 1) return;
      deck_spot = spot[0];
    }
    deck_spot.innerHTML = getDecks();
  };

  this.setupPlayer = function(player) {
  };

  this.set = function(name, value) {
  };

  this.recordCard = function(player, cardName) {
  };

  this.gainCard = function(player, card, count, trashing) {
  };

  this.maybeHandleFirstTurn = function() {
  };

  this.beforeTurn = function() {
  };

  this.startTurn = function(node) {
  };

  this.gainPirateShipToken = function(player, count) {
  };

  this.toNativeVillage = function(player, spec) {
  };

  this.clearNativeVillage = function(player) {
  };

  this.handleLog = function(elems, nodeText) {
  };

  this.updateCardCountVisibility = function() {
  };

  this.hide = function() {
  };

  this.remove = function() {
  };

  this.stop() = function() {
  };

  this.handle = function(doc) {
  };

  this.enterLobby = function() {
  };
}