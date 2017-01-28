var Puid = require('puid');

var puid = new Puid();
function Group () {
	this.id = puid.generate();
	this.state = {};
	this.members = [];
	this.maxSize = 2;
}
Group.prototype.insert = function(client) {
	this.members.push(client);
};
Group.prototype.remove = function(client) {
	for (var i = 0, l = this.members.length; i < l; i++) {
		if (this.members[i].id === client.id) {
			this.members.splice(i,1);
		}
	}
};
Group.prototype.broadcast = function(name, data, skipID) {
	for (var i = 0, l = this.members.length; i < l; i++) {
		if (this.members[i].id !== skipID) {
			this.members[i].emit(name, data);
		}
	}
};

Group.prototype.changeState = function(path, obj){
	var pathSteps =  path.split('/');
	var stateObjectReference = this.state;
	for(var i = 0; i < pathSteps.length; i++){
		if(stateObjectReference[pathSteps[i]] === null || stateObjectReference[pathSteps[i]] === undefined){
			stateObjectReference[pathSteps[i]] = {};
		}
		if(pathSteps[i] !== null){
            if(i === 0){
				if(pathSteps.length === 1){
					stateObjectReference[pathSteps[i]] = obj;
				} else {
					stateObjectReference = this.state[pathSteps[i]];
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

Group.prototype.getState = function(path){
	if(!path) return this.state;
	var pathSteps =  path.split('/');
	var stateObjectReference = this.state;
	for(var i = 0; i < pathSteps.length; i++){
		// Return the last element if the other one does not exist. 
		if(stateObjectReference[pathSteps[i]] === null || stateObjectReference[pathSteps[i]] === undefined){
			return stateObjectReference;
		}
		if(pathSteps[i] !== null){
            if(i === 0){
				if(pathSteps.length === 1){
					return stateObjectReference[pathSteps[i]];
				} else {
					stateObjectReference = this.state[pathSteps[i]];
				}
            } else {
				if(i === pathSteps.length-1){
					return stateObjectReference[pathSteps[i]];
				} else {
                	stateObjectReference = stateObjectReference[pathSteps[i]];
				}
            }

		}
	}
};

module.exports = Group;