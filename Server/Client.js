var	EventEmitter = require('events').EventEmitter,
	Puid = require('puid'),
	crypto = require('crypto');

var puid = new Puid();
function Client (socket) {
	if (!socket) throw "Can not create a Client without a socket";

	this.events = new EventEmitter();
	this.socket = socket;
	this.id = puid.generate();

	this.setSocket(socket);
}
Client.prototype.setSocket = function(socket) {
	this.socket = socket;

	var self = this;
	this.socket.on('close', function() {
		//self.events.emit('disconnect', self);
	});
	this.socket.on('error', function(e) {
		self.events.emit('error', e);
	});
	this.socket.on('message', function(message){
		// Increase CPU Usage using encryption

		for(var i = 0, l = 20; i<l; i++){ // high = 20, veryhigh = 100
			var cipher = crypto.createCipher('aes-256-cbc', 'dfnjdfopr2f2ccsdf3ayh43w8ofnwevo8v3');
			var c = cipher.update(message, 'utf8', 'hex');
			c += cipher.final('hex');
			var decipher = crypto.createDecipher('aes-256-cbc', 'dfnjdfopr2f2ccsdf3ayh43w8ofnwevo8v3');
			var d = decipher.update(c, 'hex', 'utf8')
			d += decipher.final('utf8');
		}
		
		
		var data = JSON.parse(message);
		self.events.emit(data.name, data.data);

		if (data.name === "updateState") {
			setTimeout(function () {
				self.socket.emit('message', message);
			}, 40);
		}
	});

};
Client.prototype.emit = function(name, data) {
	if(!name || typeof name !== 'string') throw "Emit requires a name of type String";
	if (this.isOpen()) {
		this.socket.send(JSON.stringify({
			name: name,
			data: data || {}
		}));
	}
};
Client.prototype.isOpen = function() {
	return this.socket.readyState === this.socket.OPEN;
};
Client.prototype.bind = function(name, callback) {
	this.events.on(name, callback);
};

module.exports = Client;