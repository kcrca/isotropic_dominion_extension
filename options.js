function setupOption(default_value, name) {
  var enable = localStorage[name];
  if (enable == undefined) {
    enable = default_value;
  }

  $('#' + name).attr('checked', enable);
}

function loadOptions() {
  setupOption(true, "allow_disable");
  setupOption(false, "status_announce");
}

function generateOptionButton(name, desc) {
  var control = $('<label/>').attr('for', name);
  var button = $('<input type="checkbox"/>').attr('id', name).attr('name',
      name);
  button.click(saveOption);
  control.append(button).append(desc);
  button.attr('checked', localStorage[name] == 't');
  return control;
}

function generateOption(name, option_desc, extra_desc) {
  if (extra_desc != "") {
    option_desc += ' <span class="optionNote">(' + extra_desc + ')</span>';
  }
  return generateOptionButton(name, option_desc);
}

function saveOption(evt) {
  var button = $(evt.target);
  localStorage[button.attr('id')] = button.attr('checked');
}

function insertOptions(under) {
  var element = $('<div/>').attr('id', "pointCounterOptions");
  element.append('<h3>Dominion Point Counter Options</h3>');
  var disableControl = generateOption("allow_disable",
      "Allow opponents to disable point counter with !disable.", "");
  var announceControl = generateOption("status_announce",
      "Change lobby status to announce you use point counter.",
      "Mandatory if disabling is not allowed.");
  element.append(disableControl).append(announceControl);
  under.append(element);

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

  disableControl.trigger('change');
}


$(document).ready(insertOptions($(document.body)));