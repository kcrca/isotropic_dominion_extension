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

function optionBuildControls(tag, showTitle) {
  showTitle = showTitle != undefined ? showTitle : true;
  tag = tag || 'div';

  var div = $('<' + tag + '/>').attr('id', 'optionPanel');
  if (showTitle) {
    div.append('<h3>Dominion Point Counter Options</h3>');
  }

  optionButtons = {};
  optionGenerate('allow_disable', div,
      "Allow opponents to disable point counter with !disable.");
  optionGenerate('status_announce', div,
      "Change lobby status to announce you use point counter.",
      "Mandatory if disabling is not allowed.");
  optionGenerate('show_card_counts', div,
      "Show every player's card counts for each card");
  optionGenerate('show_active_data', div,
      "Show current data for the active player", "Beta feature");

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
