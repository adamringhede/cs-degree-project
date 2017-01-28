var net = require('net'),
	config = require('../config'),
	Client = require('./Client'),
	Group = require('./Group'),
	EventEmitter = require('events').EventEmitter,
	WebSocketServer = require('ws').Server,
	RedundancyController = require('../RedundancyController');

function Server () {
	this.clients = {};
	this.numClients = 0;
	this.groups = [];
	this.queue = [];
	this.rc = new RedundancyController(this.hostGroup, this, this.groups);

	var self = this;
	var setClientListeners = function (client) {
		client.bind('disconnect', function () {
			if (client.group) {
				client.group.remove(client);
				client.group.broadcast('disconnected', client.id);
				client.group = false;
			}
			// Remove the client from the queue
			for (var i = 0, l = self.queue.length; i < l; i++) {
				if (self.queue[i].id === client.id) {
					self.queue.splice(i, 1);
					console.log("Removed from queue " + client.id);
					console.log(self.queue);
				}
			}
			// Remove the client from the server
			delete self.clients[client.id];
			self.numClients--;
		});
		client.bind('joinGroup', function (data) {
			if (!data.id || typeof data.id !== 'string') {
				// Join any group
				self.addToGroup(client)
			} else {
				// Join a specific group
				self.addToGroup(client, data.id);
			}
		});	
		client.bind('updateState', function (data){
			client.group.changeState(data.path, data.obj)
			client.group.broadcast('stateChanged', data);
			self.rc.update(client.group.id, data.path, data.obj);
		});
	};
	var wss = new WebSocketServer({port: config.nodes[config.server.nodeID].clientsPort});
	wss.on('connection', function(ws) {
		var client = new Client(ws);
		client.emit('clientID', {
			id: client.id
		});
		self.clients[client.id] = client;
		self.numClients++;
		setClientListeners(client);
	});
}
Server.prototype.hostGroup = function (data) {
	var group = new Group();
	group.id = data.id;
	group.state = data.state;
	//this.rc.update(group.id, null, group.state); // This should hopefully not be needed since this would be very demanding on the network
	this.groups.push(group);
};
Server.prototype.addToGroup = function (client, groupID) {
	function onFoundGroup (group, client) {
		client.group = group;
		var clientIDs = [];
		for (var i = 0, l = group.members.length; i < l; i++) {
			clientIDs.push(group.members[i].id);
		}
		client.emit('_foundGroup', {
			state: group.state,
			id: group.id,
			members: clientIDs
		})
	}

	if (!groupID) { // Add to any group
		var foundGroup = false;
		for (var i = 0, l = this.groups.length; i < l; i++) {
			var group = this.groups[i];
			if (group.members.length < group.maxSize) {
				foundGroup = true;
				group.insert(client);
				onFoundGroup(group, client);
				return true;
			}
		}
		if (!foundGroup) {
			if (this.queue.length > 0) {
				// Find another viable client
				var otherClient = false;
				for (var i = 0, l = this.queue.length; i < l; i++) {
					if (this.queue[i] !== client && this.queue[i].isOpen() && !this.queue[i].group) {
						otherClient = this.queue[i];
						this.queue.splice(i, 1); // remove the other client from the queue

						// Create a new group
						var newGroup = new Group();
						this.rc.update(newGroup.id, null, newGroup.state);
						this.groups.push(newGroup);
						newGroup.insert(client);
						newGroup.insert(otherClient);
						onFoundGroup(newGroup, client);
						onFoundGroup(newGroup, otherClient);
						break;
					}
				}
				if (!otherClient) {
					this.queue.push(client);
					client.emit('findGroupPutInQueue', {
						position: this.queue.length
					});
				}
			} else {
				this.queue.push(client);
				client.emit('findGroupPutInQueue', {
					position: this.queue.length
				});
			}
		}
	} else { // Add to a specific group
		for (var i = 0, l = this.groups.length; i < l; i++) {
			if (this.groups[i].id === groupID) {
				if (this.groups[i].members.length < this.groups[i].maxSize) {
					this.groups[i].insert(client);
					onFoundGroup(this.groups[i], client);
					return true;
				} else {
					client.emit('findGroupErrorFull', {
						groupID: groupID
					});
					return false;
				}
			} 
		}
		// The group is not hosted on this server.

		this.rc.findGroupLocation(groupID, function (location) {
			if (location) {
				client.emit('findGroupRedirect', location);
			} else {		
				client.emit('findGroupErrorFindGroup', {
					groupID: groupID
				});
			}
		});
	}
};
module.exports = Server