var ncm = require('./NodeConnectionManager'),
	config = require('./config');

function GroupStatesReceiver (backup) {

	ncm.onNewConnection(function (nodeSocket) {
		nodeSocket.bind('stateUpdate', function (data) {
			var groupStateClone = backup.get(data.emitterID, data.groupID);
			if (groupStateClone) {
				backup.changeState(data.emitterID, data.groupID, data.path, data.data);
			} else {
				if (data.path === null) {
					backup.createGroup(data.emitterID, data.groupID, data.data);
				}
			}
		});
	});
}

module.exports = GroupStatesReceiver;