var tableBody;

$(document).ready(function() {
  tableBody = $('#log-table > tbody');
  $.pm.bind('logOptions', handleLogOptions);
  $.pm.bind('logRecord', handleLogRecord);
});

function handleLogOptions(data) {
  if (data.style) {
    updateDataStyle(data);
  }
}

function handleLogRecord(data) {
  var levelClass = 'log-level-' + data.level;
  var areaClass = 'log-area-' + data.area;
  var row = $('<tr/>').addClass(levelClass).addClass(areaClass);
  row.append($('<td class="log-area"/>').text(data.area));
  row.append($('<td class="log-level"/>').text(data.level));
  row.append($('<td class="log-when"/>').text(data.when));
  row.append($('<td class="log-message"/>').text(data.message));
  tableBody.append(row);
}

function internalLog(level, message) {
  handleLogRecord({
    area: 'logInternal',
    level: level,
    when: new Date(),
    message: message});
}

function updateDataStyle(data) {
  var logStyle = $('#log-css');
  if (logStyle.length == 0) {
    internalLog(log.levels.Config, "Cannot find CSS node to replace");
    return;
  }
  if (data.style.index("<") != 0) {
    logStyle.attr('href', data.style);
  } else {
    logStyle.replaceWith($(data.style));
  }
}
