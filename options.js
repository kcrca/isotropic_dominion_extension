var optionButtons;

function setupOption(name, default_value) {
  if (localStorage[name] == undefined) {
    localStorage[name] = default_value;
  }
  $('#' + name).attr('checked', optionSet(name));
}

function optionSet(name) {
  return localStorage[name] == "true";
}

function loadOptions() {
  setupOption("allow_disable", true);
  setupOption("status_announce", false);
  setupOption('show_card_counts', true);
}

function generateOptionButton(name, desc) {
  var control = $('<label/>').attr('for', name);
  var button = $('<input type="checkbox"/>').attr('id', name).attr('name',
      name);
  button.change(saveOption);
  control.append(button).append(desc);
  button.attr('checked', localStorage[name]);
  optionButtons.push(button);
  return control;
}

function generateOption(name, under, option_desc, extra_desc) {
  if (extra_desc) {
    option_desc += ' <span class="optionNote">(' + extra_desc + ')</span>';
  }
  var button = generateOptionButton(name, option_desc);
  under.append(button);
  return button;
}

function saveOption(evt) {
  var button = $(evt.target);
  var name = button.attr('id');
  localStorage[name] = button.attr('checked');
}

function insertOptions(under) {
  optionButtons = [];

  var div = $('<div/>').attr('id', 'pointCounterOptions');
  div.append('<h3>Dominion Point Counter Options</h3>');
  generateOption('allow_disable', div,
      "Allow opponents to disable point counter with !disable.");
  generateOption('status_announce', div,
      "Change lobby status to announce you use point counter.",
      "Mandatory if disabling is not allowed.");
  generateOption('show_card_counts', div,
      "Show every player's card counts for each card");
  under.append(div);

  loadOptions();

  var disableButton = $('#allow_disable');
  var annouceButton = $('#status_announce');

  $('#allow_disable').change(function() {
    if (disableButton.attr('checked')) {
      annouceButton.attr('disabled', false);
    } else {
      annouceButton.attr('checked', true);
      annouceButton.attr('disabled', true);
    }
  });

  for (var i = 0; i < optionButtons.length; i++) {
    optionButtons[i].change();
  }
}

$(document).ready(function() {
  if ($('body > p.info').length > 0) {
    insertOptions($(document.body))
  }
});