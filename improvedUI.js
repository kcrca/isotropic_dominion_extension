function ImprovedUI() {
  var uiInfo = JSON.parse(localStorage.uiInfo);

  var doneAutoLogin;

  function save() {
    localStorage.uiInfo = JSON.stringify(uiInfo);
  }

  //noinspection JSUnusedGlobalSymbols
  var input = {
    inputButton: {
      selector: 'input[type="text"]',
      get: function(node) {
        return node.attr('value');
      },
      set: function(node, value) {
        return node.attr('value', value);
      }
    },
    select: {
      selector: 'select',
      get: function(node) {
        var selected = [];
        node.find('option:selected').each(function() {
          selected.push($(this).text());
        });
        return selected.join('|');
      },
      set: function(node, value) {
        var selected = value.split(/|/);
        $.each(selected, function(index, val) {
          selected[val] = true;
        });
        node.find('option').each(function() {
          var $this = $(this);
          var text = $this.text();
          if (selected[text]) {
            $this.attr('selected', true);
          } else {
            $this.removeAttr('selected');
          }
        });
      }
    }
  };

  //noinspection JSUnusedLocalSymbols
  function handleLoginPage(doc) {
  }

  function handleLoginInfoPage(doc) {
    var submitButton = doc.filter('input[type="submit"]');
    // Press the submit button if we don't see an error message
    if (submitButton.length > 0 &&
        $('body > p:contains("Choose a ")').length > 0) {
      if (optionSet('auto_login') && !doneAutoLogin) {
        submitButton.click();
        doneAutoLogin = true;
      }
    }
  }

  jQuery.fn.setFirstRealTextNode = function(txt) {
    return this.each(function() {
      var $this = jQuery;
      var c = $this(this).contents().filter(function() {
        return this.nodeType == 3 && $this.trim(this.nodeValue).length > 0;
      })[0];
      if (c) c.nodeValue = txt;
    })
  };

  function initialUpperCase(text) {
    return text.substr(0, 1).toUpperCase() + text.substr(1);
  }

  function getTextNodesIn(node) {
    if (node.length == 0) return [];
    node = node[0];
    var textNodes = [], whitespace = /^\s*$/;

    function getTextNodes(node) {
      if (node.nodeType == 3) {
        if (!whitespace.test(node.nodeValue)) {
          textNodes.push(node);
        }
      } else if (node.childNodes) {
        for (var i = 0, len = node.childNodes.length; i < len; ++i) {
          getTextNodes(node.childNodes[i]);
        }
      }
    }

    getTextNodes(node);
    return textNodes;
  }

  function capitalizeForm(doc, selector) {
    var kids = doc.filter(selector);
    rewriteTree(function () {
      var textNodes = getTextNodesIn(kids);
      for (var i = 0; i < textNodes.length; i++) {
        textNodes[i].nodeValue = initialUpperCase(textNodes[i].nodeValue);
      }
      // Put in spaces to allow breaks between the items
      kids.find('span').after('<wbr>');
    });
  }

  // Have we ever seen an inLobby marker? If not, then this is the first time we
  // are on the page and really are in the lobby, we just don't know it yet.
  var seenLobby = false;

  function handlePlayPage(doc) {
    var isInLobby = inLobby();
    seenLobby |= isInLobby;
    if (isInLobby || !seenLobby) {
      if (doc.is('div.automatch')) {
        capitalizeForm(doc, 'div.automatch');
      }
      if (doc.is('table.constr')) {
        capitalizeForm(doc, 'table.constr');
      }
      if (doc.filter('#log').prev().attr('id') == 'header') {
        rewriteTree(function() {
          $('#header').after($('#lobby'));
        });
      }
    }
  }

  this.handle = function(doc) {

    if (window.location.pathname == '/') {
      handleLoginPage(doc);
    } else if (window.location.pathname == '/loggedin') {
      handleLoginInfoPage(doc);
    } else if (window.location.pathname == '/play') {
      if (typeof(rewritingTree) != 'undefined' && rewritingTree) return;
      handlePlayPage(doc);
    }
  }

}

if (!localStorage.uiInfo || localStorage.uiInfo == "") {
  localStorage.uiInfo = JSON.stringify({});
}

var uiInfo = new ImprovedUI();

optionButtons.auto_login = {
  text: "Reuse login data from previous session"
};

$(document).ready(function() {
  uiInfo.handle($(document.body));
  $(document.body).bind('DOMNodeInserted', function(ev) {
    uiInfo.handle($(ev.target));
  });
});
