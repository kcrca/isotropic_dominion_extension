// All the option buttons.
var optionButtons = {};
var inGameName = ['show_card_counts', 'show_active_data'];
var inGame = {};
(function() {
  for (var i = 0; i < inGameName.length; i++) {
    inGame[inGameName[i]] = true;
  }
})();

function optionSetup(name, default_value) {
  if (localStorage[name] == undefined) {
    localStorage[name] = default_value;
  }
  $('#' + name).attr('checked', optionSet(name));
}

function optionSet(name) {
  return localStorage[name] == "true";
}

function optionLoadAll() {
  optionSetup("allow_disable", true);
  optionSetup("status_announce", false);
  optionSetup('show_card_counts', true);
  optionSetup('show_active_data', false);

  // Sanity check the options. There were bugs in enforcing this.
  // If disabling is not allowed, require status announce.
  if (localStorage["allow_disable"] == "f") {
    if (localStorage["status_announce"] != "t") {
      alert("Enabling post in status message.\n" +
          "This setting was lost due to a bug.\n\n" +
          "If you do not want to post in status message, " +
          "please allow disabling and turn off this setting.");
      localStorage["status_announce"] = "t";
      $('#status_announce_t').attr('checked', true);
    }
    $('#status_announce_t').attr('disabled', true);
    $('#status_announce_f').attr('disabled', true);
  }
}

function optionGenerateButton(name, desc) {
  var control = $('<label/>').attr('for', name);
  var button = $('<input type="checkbox"/>').attr('id', name).attr('name',
      name);
  button.change(optionSave);
  control.append(button).append(desc);
  button.attr('checked', optionSet(name));
  optionButtons[name] = button;
  var nextAll = control.nextAll();
  var andSelf = nextAll.andSelf();
  andSelf.addClass(inGame[name] ? 'inGame' : 'notInGame');
  return control;
}

function optionGenerate(name, under, option_desc, extra_desc) {
  if (extra_desc) {
    option_desc += ' <span class="optionNote">(' + extra_desc + ')</span>';
  }
  var button = optionGenerateButton(name, option_desc);
  under.append(button);
  return button;
}

function optionSave(evt) {
  var button = $(evt.target);
  var name = button.attr('id');
  localStorage[name] = button.attr('checked');
}

optionButtons = {
  allow_disable: {text: "Allow opponents to disable point counter with !disable."},
  status_announce: {text: "Change lobby status to announce you use point counter.",
    extra: "Mandatory if disabling is not allowed."},
  show_card_counts: {text: "Show every player's card counts for each card"},
  show_active_data: {text: "Show current data for the active player",
    extra: "Beta feature"}
};

function optionBuildControls(tag, showTitle) {
  showTitle = showTitle != undefined ? showTitle : true;
  tag = tag || 'div';

  var div = $('<' + tag + '/>').attr('id', 'optionPanel');
  if (showTitle) {
    div.append('<h3>Dominion Point Counter Options</h3>');
  }

  for (var opt in optionButtons) {
    optionGenerate(opt, div, optionButtons[opt].text, optionButtons[opt].extra);
  }

  optionLoadAll();

  var disableButton = optionButtons['allow_disable'];
  var annouceButton = optionButtons['status_announce'];

  disableButton.change(function() {
    if (disableButton.attr('checked')) {
      annouceButton.attr('disabled', false);
    } else {
      annouceButton.attr('checked', true);
      annouceButton.attr('disabled', true);
    }
  });

  // Make each button act as if changed to its current value to trigger effects.
  for (var name in optionButtons) {
    optionButtons[name].change();
  }
  return div;
}
