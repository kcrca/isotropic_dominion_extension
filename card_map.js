// Keep a map from all card names (singular or plural) to the card object.
var card_map = {};

(function() {
  for (var i = 0; i < card_list.length; i++) {
    var card = card_list[i];
    card_map[card.Singular] = card;
    card_map[card.Plural] = card;

    card.getVP = function() {
      var num = parseInt(this.VP);
      return isNaN(num) ? 0 : num;
    };
  }

  // Mandarin *does* get you $3, but the game reports it
  // the same way it does for variable-value cards (like Bank), so the normal
  // code adds it in there automatically. Rather than put in a special case in
  // that code, we'll just pretend it gives you no coins.
  card_map['Mandarin'].Coins = '0';
})();
