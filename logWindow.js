var tableBody;

$(document).ready(function() {
  $.pm.bind('logOptions', handleLogOptions);
  $.pm.bind('logRecord', handleLogRecord);
});

function handleLogOptions(data) {
  if (data.style) {
    updateDataStyle(data);
  }
}

function handleLogRecord(data) {
  log.handlers.div.publish(data.area, data.levelNum, data.level, data.when,
      data.message);
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
