function OrigView() {
  // Places to print number of cards and points.
  var deck_spot;
  var points_spot;

  this.hide = function() {
    if (deck_spot) deck_spot.innerHTML = "exit";
    if (points_spot) points_spot.innerHTML = "faq";
  };

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

  //noinspection JSUnusedLocalSymbols
  this.updateDeck = function(player) {
    if (deck_spot == undefined) {
      var spot = $('a[href="/signout"]');
      if (spot.length != 1) return;
      deck_spot = spot[0];
    }
    deck_spot.innerHTML = getDecks();
  };

  //noinspection JSUnusedLocalSymbols
  this.setupPlayer = function(player) {
  };

  //noinspection JSUnusedLocalSymbols
  this.set = function(name, value) {
  };

  //noinspection JSUnusedLocalSymbols
  this.recordCard = function(player, cardName) {
  };

  //noinspection JSUnusedLocalSymbols
  this.gainCard = function(player, card, count, trashing) {
  };

  this.beforeTurn = function() {
  };

  //noinspection JSUnusedLocalSymbols
  this.startTurn = function(node) {
  };

  //noinspection JSUnusedLocalSymbols
  this.gainPirateShipToken = function(player, count) {
  };

  //noinspection JSUnusedLocalSymbols
  this.toNativeVillage = function(player, spec) {
  };

  //noinspection JSUnusedLocalSymbols
  this.clearNativeVillage = function(player) {
  };

  //noinspection JSUnusedLocalSymbols
  this.handleLog = function(elems, nodeText) {
  };

  this.updateCardCountVisibility = function() {
  };

  this.hide = function() {
  };

  this.remove = function() {
  };

  this.stop = function() {
  };

  //noinspection JSUnusedLocalSymbols
  this.handle = function(doc) {
  };

  this.enterLobby = function() {
  };

  this.addChatCommands = function() {
  };
}