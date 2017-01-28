var net = require('net'),
	config = require('./config'),
	EventEmitter = require('events').EventEmitter,
	carrier = require('carrier');


function NodeConnectionManager () {
	this.sockets = {};
	this.events = new EventEmitter();

	var self = this;
	var server = net.createServer(function(socket) {
		var nodeSocket = new NodeSocket(socket);
		nodeSocket.once('nodeid', function (data) {
			nodeSocket.setID(data.nodeID);
			nodeSocket.bind('disconnect', function () {
				delete self.sockets[data.nodeID];
			});	
			self.sockets[data.nodeID] = nodeSocket;

			self.events.emit('receivedConnection', nodeSocket);
			self.events.emit('newConnection', nodeSocket);
		});
	});
	var port = config.nodes[config.server.nodeID].port;
	var host = config.nodes[config.server.nodeID].host;
	server.listen(port, function() {
		console.log("Listening on host:port  "+host+":" + port);
	});
}
NodeConnectionManager.prototype.onReceivedConnection = function(callback) {
	this.events.on('receivedConnection', callback);
};
NodeConnectionManager.prototype.onNewConnection = function(callback) {
	this.events.on('newConnection', callback);
};
NodeConnectionManager.prototype.broadcast = function(name, data) {
	for (var nodeID in this.sockets) {
		if(this.sockets[nodeID].state === 0) {
			this.sockets[nodeID].emit(name, data);
		}
	}
};
NodeConnectionManager.prototype.disconnect = function(nodeSocket) {
	if (this.sockets[nodeSocket.id]) {
		try {
			nodeSocket.end();
		} catch (e) {}
		delete this.sockets[nodeSocket.id];
	}
};
NodeConnectionManager.prototype.reconnect = function(nodeSocket, success, failure) {
	var node = config.nodes[nodeSocket.id];
	if (!node) {
		if (failure) failure(nodeSocket);
		return false;
	}

	var socket = net.connect({host: node.host, port: node.port}, function() {
		nodeSocket.setSocket(socket);
		if (success) success(nodeSocket);
		self.events.emit('newConnection', nodeSocket);
	});
	socket.on('error', function(err) {
		if (err.code === 'ECONNREFUSED') {
			if (failure) failure(nodeSocket);
		}
	});
};
NodeConnectionManager.prototype.count = function() {
	var n = 0;
	for (var nodeID in this.sockets) {
		if(this.sockets[nodeID]) n++;
	}
	return n;
};
NodeConnectionManager.prototype.countOpen = function() {
	var n = 0;
	for (var nodeID in this.sockets) {
		if(this.sockets[nodeID] && this.sockets[nodeID].state === 0) n++;
	}
	return n;
};
NodeConnectionManager.prototype.delete = function(nodeID) {
	delete this.sockets(nodeID);
};

NodeConnectionManager.prototype.createConnection = function(nodeID, callback, errorCallback) {
	var node = config.nodes[nodeID];
	if(!node) throw "There is no node with the nodeID: " + nodeID;
	if(this.sockets[nodeID] && this.sockets[nodeID].state === 0){
		callback(this.sockets[nodeID]);
	} else {
		var self = this;
		var socket = net.connect({host: node.host, port: node.port}, function() {
			var nodeSocket = new NodeSocket(socket, nodeID);
			nodeSocket.bind('disconnect', function () {
				delete self.sockets[nodeID];
			});
	  		self.sockets[nodeID] = nodeSocket;
	  		nodeSocket.emit('nodeid', {
	  			nodeID: config.server.nodeID
	  		});
	  		callback(nodeSocket);
	  		self.events.emit('newConnection', nodeSocket);
		});
		socket.on('error', function(err) {
			if (err.code === 'ECONNREFUSED') {
				errorCallback('ECONNREFUSED');
				console.log("The connection to " + node.host + ":" + node.port + " was refused");
			}
		});
	}
};

function NodeSocket (socket, nodeID) {
	if (!socket) throw "Can not create a NodeSocket without a socket";
	var node = config.nodes[nodeID];

	this.events = new EventEmitter();
	this.hostname = node && node.host;
	this.port = node && node.port;
	this.socket = socket;
	this.id = nodeID || "noID";
	this.TUNN = -1; 
	this.state = 0; // 0 = Open , 1 = Closed
	this.carrier;

	this.setSocket(socket);
}
NodeSocket.prototype.setSocket = function(netSocket) {
	this.socket = netSocket;
	this.socket.setEncoding('utf8');
	this.carrier = carrier.carry(netSocket);

	var self = this;
	this.socket.on('close', function() {
		self.state = 1;
		self.events.emit('disconnect', self);
	});
	this.socket.on('error', function(para) {

	});
	this.carrier.on('line', function(line) {
    	var data = JSON.parse(line);
		self.events.emit(data.name, data.data);
	});

};
NodeSocket.prototype.setID = function(id) {
	var node = config.nodes[id];
	this.id = id;
	this.hostname = node && node.host;
	this.port = node && node.port;
};
NodeSocket.prototype.emit = function(name, data) {
	if (!this.socket.writable || this.state !== 0) return;
	if(!name || typeof name !== 'string') throw "Emit requires a name of type String";

	this.socket.write(JSON.stringify({
		name: name,
		data: data || {}
	}) + "\r\n");
};
NodeSocket.prototype.bind = function(name, callback) {
	this.events.on(name, callback);
};
NodeSocket.prototype.once = function(name, callback) {
	this.events.once(name, callback);
};

module.exports = new NodeConnectionManager();