function ImprovedUI() {
  var uiInfo = JSON.parse(localStorage.uiInfo);

  var doneAutoLogin;

  //noinspection JSUnusedLocalSymbols
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

  function handleLoginInfoPage() {
    var submitButton = $('input[type="submit"]');
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
    var top = doc.filter(selector);
    if (top.length == 0) return;
    rewriteTree(function () {
      var textNodes = getTextNodesIn(top);
      for (var i = 0; i < textNodes.length; i++) {
        var node = textNodes[i];
        node.nodeValue = initialUpperCase(node.nodeValue);
        if (node.parentNode == top[0] || node.parentNode.tagName == 'TD') {
          $(node).wrap('<span class="formPrompt"/>');
        }
      }
      // Put in spaces to allow breaks between the items
      top.find('span').after('<wbr>');
    });
  }

  // Have we ever seen an inLobby marker? If not, then this is the first time we
  // are on the page and really are in the lobby, we just don't know it yet.
  var seenLobby = false;
  var spanTemplate;
  var foundLogHeight = false;

  function handlePlayPage(doc) {
    // Quick tests for the changes that come all the time, not just on load.
    var tag = doc[0].tagName;
    if (tag == 'INPUT') return;
    if (tag == 'SPAN') {
      if (!spanTemplate && doc.hasClass('choice2') &&
          $('span.marker', doc).length > 0) {
        var dup = doc.clone();
        $('[id]', dup).removeAttr('id');
        $('input', dup).attr('name', 'spanTemplate');
        $('label', dup).removeAttr('listen').text('Spacer');
        $('.pstat').text('Short Status');
        dup.css('visibility', 'hidden');
        spanTemplate = dup;
        rewriteTree(function() {
          $('player_table br').replaceWith(spanTemplate.clone());
        });
      }
      return;
    }
    if (tag == 'BR') {
      if (spanTemplate) {
        rewriteTree(function() {
          doc.replaceWith(spanTemplate.clone());
        });
      }
      return;
    }
    if (doc.hasClass('logline')) return;

    var isInLobby = inLobby();
    if (isInLobby || !seenLobby) {
      $('div.automatch').add('table.constr').addClass('formArea');

      capitalizeForm(doc, '.formArea');
      
      rewriteTree(function () {
        $('#propose_button:contains("propose")').text('Propose game with:');
        $('table.constr tr:first-child td:first-child > input:first-child').each(function() {
          $(this).before($('<span class="formPrompt">Game options:</span>'));
        });
        $('#player_table td[colspan="3"]').each(function() {
          var $this = $(this);
          if ($('span.formPrompt', $this).length > 0) return;
          var textNodes = getTextNodesIn($this);
          for (var i = 0; i < textNodes.length; i++) {
            var node = textNodes[i];
            var oldText = node.nodeValue;
            var newText = oldText.replace(/Your status is/, 'Your status:');
            if (newText != oldText) {
              node.nodeValue = newText;
              $(node).wrap('<span class="formPrompt"/>');
            }
          }
        });
        
      });

      var log;
      if (!foundLogHeight && (log = $('#log')).length > 0) {
        rewriteTree(function () {
          var spacer = $('<div class="logline logSpacer">Spacer</div>');
          spacer.css('visibility', 'hidden');
          for (var i = 0; i < 7; i++) {
            log.append(spacer.clone());
          }
          foundLogHeight = true;
          log.css('min-height', log.css('height'));
          log.find('.logSpacer').remove();
        });
      }
    }
    seenLobby |= isInLobby;
  }

  this.handle = function(doc) {
    if (window.location.pathname == '/') {
      handleLoginPage(doc);
    } else if (window.location.pathname == '/loggedin') {
      handleLoginInfoPage();
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