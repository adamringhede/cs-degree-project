var ncm = require('./NodeConnectionManager'),
	config = require('./config');

function GroupStatesEmitter (nodes, localGroupStates) {
	this.localGroupStates = localGroupStates || [];
	this.nodes = nodes;
}

GroupStatesEmitter.prototype.broadcast = function (groupID, path, data) {
	for (var nodeID in this.nodes) {
		this.emit(groupID, path, data, nodeID);
	}
};
GroupStatesEmitter.prototype.emit = function (groupID, path, data, nodeID) {
	if (this.nodes[nodeID].state === 0) {
		this.nodes[nodeID].emit('stateUpdate', {
			emitterID: config.server.nodeID,
			groupID: groupID,
			path: path,
			data: data
		});
	}
};
GroupStatesEmitter.prototype.emitAll = function(nodeID) {
	for(var i = 0, l = this.localGroupStates.length; i < l; i++) {
		this.emit(  this.localGroupStates[i].id,
					null,
					this.localGroupStates[i].state,
					nodeID );
	}
};

module.exports = GroupStatesEmitter;