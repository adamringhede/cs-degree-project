var GroupStatesEmitter = require('./GroupStatesEmitter'),
	GroupStatesReceiver = require('./GroupStatesReceiver'),
	FaultDetector = require('./FaultDetector'),
	EventEmitter = require('events').EventEmitter;
	Backup = require('./Backup'),
	ncm = require('./NodeConnectionManager'),
	config = require('./config');

function RedundancyController (hostFunction, scope, localGroupStates) {
	this.nodes = {};
	this.backup = new Backup();
	this.gsr = new GroupStatesReceiver(this.backup);
	this.gse = new GroupStatesEmitter(this.nodes, localGroupStates); 
	this.faultDetector = new FaultDetector();
	this.TUNN = -1;
	this.events = new EventEmitter();
	this.recovering = false;

	var self = this;

	var hashCode = function(s){return s.split("").reduce(function(a,b){a=((a<<5)-a)+b.charCodeAt(0);return a&a},0);}
	function recover (serverID, callback) {
		self.recovering = true;
		var numServers = ncm.countOpen() + 1, // Include the local node
			recoveredCount = 0,
			totalCount = 0;

		console.log("Starting recover with the following variables:");
		console.log("    TUNN: " + self.TUNN + "      NumServers: " + numServers);

		for (var cloneID in self.backup.nodes[serverID]) {
			totalCount++;
			var targetHostNumber = Math.abs(hashCode(cloneID) % numServers);
			if (targetHostNumber === self.TUNN) {
				hostFunction.call(scope, {
					state: self.backup.get(serverID, cloneID),
					id: cloneID
				});
				recoveredCount++;
			} else {
				for (var nodeID in self.nodes) {
					if (self.nodes[nodeID].TUNN === targetHostNumber && self.nodes[nodeID].state === 0) {
						self.backup.createGroup(nodeID, cloneID, self.backup.get(serverID, cloneID));
						break;
					}
				}
			}
			delete self.backup.nodes[serverID][cloneID]; // Otherwise Backup.getNodeIDByGroup may return an offline node.
		}
		console.log("Recovered "  + recoveredCount + "/" + totalCount + " groups from node " + serverID);
		self.recovering = false;
		self.events.emit('finishedRecovery');
		callback.call(this);
	}
	
	ncm.onNewConnection(function (nodeSocket) {
		self.nodes[nodeSocket.id] = nodeSocket;

		nodeSocket.bind('TUNN', function (data) {
			nodeSocket.TUNN = data.TUNN; 
			if (data.TUNN >= 0 && self.TUNN > 0 && data.TUNN+1 === self.TUNN) {
				self.faultDetector.monitor(nodeSocket);
			} 
			if (self.TUNN === 0) {
				var nodeWithHighestTUNN,
					highestTUNN = 0;
				for (var nodeID in self.nodes) {
					if (self.nodes[nodeID].TUNN > highestTUNN) {
						highestTUNN = self.nodes[nodeID].TUNN;
						nodeWithHighestTUNN = self.nodes[nodeID];
					}
				}
				self.faultDetector.monitor(nodeWithHighestTUNN)
			}
		});
		nodeSocket.bind('fault', function (nodeID) {
			self.events.emit('nodeFault', self.nodes[nodeID]);
			
		});

		self.gse.emitAll(nodeSocket.id);
	});

	var numConnections = 0,
		numAttempts = 0;

	self.events.on('nodeFault', function (nodeSocket) {
		self.recovering = true;
		console.log(nodeSocket.id + " faulted");
		var highest = true,
			nodeWithHighestTUNN,
			highestTUNN = 0,
			toMonitorIfHighest;
		for (var nodeID in self.nodes) {
			if (self.nodes[nodeID].state === 0 && self.nodes[nodeID].TUNN > self.TUNN) {
				highest = false;
			}
			if (self.nodes[nodeID].state === 0 && self.nodes[nodeID].id !== nodeSocket.id && self.nodes[nodeID].TUNN > highestTUNN) {
				highestTUNN = self.nodes[nodeID].TUNN;
				nodeWithHighestTUNN = self.nodes[nodeID];
			}
			if (self.nodes[nodeID].state === 0 && self.nodes[nodeID].TUNN === nodeSocket.TUNN-1) {
				toMonitorIfHighest = self.nodes[nodeID];
			}
		}
		if (highest && nodeSocket.TUNN < self.TUNN) {
			self.TUNN = nodeSocket.TUNN;
			if (nodeSocket.TUNN !== 0) self.faultDetector.monitor(toMonitorIfHighest);
			console.log("Changed local TUNN to: " + self.TUNN);
			ncm.broadcast('TUNN', {
				TUNN: self.TUNN
			});
		} else if (nodeWithHighestTUNN) {
			// Set the new TUNN of the one with the highest before the fault.
			nodeWithHighestTUNN.TUNN = nodeSocket.TUNN;
		}
		if (self.TUNN === 0 && nodeWithHighestTUNN) {
			// If no node is selected, then the local node is the only one still up.
			self.faultDetector.monitor(nodeWithHighestTUNN);
		}
		
		recover(nodeSocket.id, function () {
			ncm.disconnect(nodeSocket);
			delete self.nodes[nodeSocket.id];
		});
	});

	this.faultDetector.onFault = function (nodeSocket) {
		self.events.emit('nodeFault', nodeSocket);
		
		// Notifty the other nodes about the faulting node
		ncm.broadcast('fault', nodeSocket.id);
	};

	// Connect to every known node
	var nodeIDsToConnectTo = [];

	function onConnect (nodeSocket) {
		numConnections++; 

		onConnectionAttempt();
		console.log("Connected to node " + nodeSocket.id);
	}
	function onFinishedConnecting () {
		self.TUNN = numConnections;
		ncm.broadcast('TUNN', {
			TUNN: self.TUNN
		});
		for (var nodeID in self.nodes) {
			if (self.nodes[nodeID].TUNN >= 0 && self.TUNN > 0 && self.nodes[nodeID].TUNN+1 === self.TUNN) {
				self.faultDetector.monitor(self.nodes[nodeID]);
			} 
		}
		console.log("Local TUNN: " + self.TUNN);
	}
	function onConnectionAttempt () {
		numAttempts++;
		if (numAttempts === nodeIDsToConnectTo.length) {
			onFinishedConnecting();
		} else {
			ncm.createConnection(nodeIDsToConnectTo[numAttempts], onConnect, onConnectionAttempt);
		}
	}
	// Collect nodeIDs
	for (var nodeID in config.nodes) {
		if (nodeID !== config.server.nodeID) {
			nodeIDsToConnectTo.push(nodeID);
		}
	}
	if (nodeIDsToConnectTo.length > 0) {
		ncm.createConnection(nodeIDsToConnectTo[0], onConnect, onConnectionAttempt);
	} else {
		onFinishedConnecting();
	}


	// Listen for incoming connections
	ncm.onReceivedConnection(function (nodeSocket) {
		nodeSocket.emit('TUNN', {
			TUNN: self.TUNN
		});
		console.log("Received connection from " + nodeSocket.id);
	});
}
RedundancyController.prototype.update = function(groupID, path, data) {
	this.gse.broadcast(groupID, path, data);
};
RedundancyController.prototype.findGroupLocation = function(groupID, callback) {
	var self = this;

	function readyToRespond () {
		var nodeID = self.backup.getNodeIDByGroup(groupID);
		if (nodeID) {
			callback.call(self, {
				host: config.nodes[nodeID].host,
				port: config.nodes[nodeID].clientsPort
			});
		} else {
			// The group is not in backup. It is either hosted on this server or not at all. 
			callback.call(self, false);
		}
	}

	if (self.recovering) {
		self.events.once('finishedRecovery', readyToRespond);
	} else {
		readyToRespond();
	}
};

module.exports = RedundancyController; 