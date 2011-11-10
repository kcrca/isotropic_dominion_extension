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
    var submitButton = doc.find('input[type="submit"]');
    if (submitButton.length > 0) {
      if (optionSet('auto_login') && !doneAutoLogin) {
        submitButton.click();
        doneAutoLogin = true;
      }
    }
  }

  function handlePlayPage() {
    if (inLobby()) {
      var log = $('#log');
      if (log.prev().attr('id') == 'header') {
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
      handlePlayPage();
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
