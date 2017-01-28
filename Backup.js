function Backup () {
	this.nodes = {};
}
Backup.prototype.get = function(nodeID, groupID) {
	if(this.nodes[nodeID]) {
		return this.nodes[nodeID][groupID];
	} else {
		return undefined;
	}
	
};
Backup.prototype.set = function(nodeID, groupID, state) {
	if(this.nodes[nodeID]) {
		this.nodes[nodeID][groupID] = state;
	} else {
		this.createGroup(nodeID, groupID, state);
	}
};

Backup.prototype.changeState = function(nodeID, groupID, path, obj) {
	var pathSteps =  path.split('/');
	var state = this.get(nodeID, groupID);
	var stateObjectReference = state;
	for(var i = 0; i < pathSteps.length; i++){
		if(stateObjectReference[pathSteps[i]] === null || stateObjectReference[pathSteps[i]] === undefined){
			stateObjectReference[pathSteps[i]] = {};
		}
		if(pathSteps[i] !== null){
            if(i === 0){
				if(pathSteps.length === 1){
					stateObjectReference[pathSteps[i]] = obj;
				} else {
					stateObjectReference = state[pathSteps[i]];
				}
            } else {
				if(i === pathSteps.length-1){
					stateObjectReference[pathSteps[i]] = obj;
					break;
				} else {
                	stateObjectReference = stateObjectReference[pathSteps[i]];
				}
            }

		}
	}
};
Backup.prototype.createGroup = function(nodeID, groupID, state) {
	if (!this.nodes[nodeID]) {
		this.nodes[nodeID] = {};
	}
	this.nodes[nodeID][groupID] = state || {};	
};
Backup.prototype.getNodeIDByGroup = function(groupID) {
	for (var nodeID in this.nodes) {
		if (this.nodes[nodeID][groupID]) {
			return nodeID;
		}
	}
	return undefined;
};
module.exports = Backup;