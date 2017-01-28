var ncm = require('./NodeConnectionManager'),
	config = require('./config'),
	EventEmitter = require('events').EventEmitter;

function FaultDetector (onFault) {
	this.monitoring;
	this.onFault = onFault || function(){};
	var self = this;
	this._onDisconnect = function (nodeSocket) {
		function success() {
			console.log("Reconnected to node: " + nodeSocket.id)
		}
		function failure () {
			self.onFault(self.monitoring);
		}
		ncm.reconnect(nodeSocket, success, failure);
	};
}
FaultDetector.prototype.monitor = function (nodeSocket) {
	if (!nodeSocket) return;
	console.log("Monitoring " + nodeSocket.id);
	this.stopMonitoring();
	this.monitoring = nodeSocket;
	nodeSocket.bind('disconnect', this._onDisconnect);
};
FaultDetector.prototype.stopMonitoring = function () {
	if (this.monitoring) {
		this.monitoring.events.removeListener('disconnect', this._onDisconnect);
		this.monitoring = undefined;
	}
};

module.exports = FaultDetector;