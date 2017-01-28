(function () {
	function Socket () {
		this.server;
	}
	Socket.prototype.emit = function (name, data) {
		this.server.send(JSON.stringify({
          name: name,
          data: data || {}
        }));
	};
	Socket.prototype.trigger = function(name, data) {
		if (name in this._events) {
			for (var i = 0, l = this._events.length; i < l; i++) {
				if (typeof this._events[name][i] === 'function') {
					this._events[name][i].call(this, data);
				}
			}
		}
	};
	Socket.prototype.bind = function (name, fn) {
		if (typeof fn !== 'function') return false;
		if (!name in this._events) {
			this._events[name] = [];
		}
		this._events[name].push(fn);
		return true;
	};
	Socket.prototype.removeListener = function(name, fn) {
		var self = this;
		for (var i = 0, l = self._events[name].length; i < l; i++) {
			if (self._events[name][i] === fn) {
				self._events[name].splice(i, 1);
			}
		}
	};
	Socket.prototype.once = function (name, fn) {
		var self = this;
		this.bind(name, function (data) {
			fn.call(self, data);
			self.removeListener(name, fn);
		});
	};


	// host, port, onConnect, onFailure, servers
	function Connection (parameters) {
		this.server;
		this.servers = parameters && parameters.servers || [];
		this.currentGroupSession;
		this.open = false;
		this.inGroup = false;
		this.id;
		this._events = {};

		if (parameters) {
			this.connect({
				host: parameters.host,
				port: parameters.port,
				onSuccess: parameters.onConnect,
				onFailure: parameters.onFailure
			});
		}

		var self = this;
		this.bind('findGroupRedirect', function (data) {
			self.connect({
				host: data.host,
				port: data.port,
				onSuccess: function () {
					if (self.currentGroupSession) {
						self.joinGroup({
							groupID: self.currentGroupSession.id,
							onFoundGroup: function (groupSession) {
								self.trigger('rejoinedGroup', groupSession);
							}
						});
					}
					self.trigger('reconnected');
				},
				onFailure: function () {
					self.trigger('rejoiningGroupFailed');
				}
			}); 
		});
	}
	// parameters may include host, port, onSuccess, onFailure
	Connection.prototype.connect = function(parameters) {
		var self = this;
		if (!parameters) parameters = {};

		function createConnection (host, port, success, failure) {
			var newServer;
			if (host && port) {
				newServer = new WebSocket("ws://" + host + ":" + port );
			} else {
				return false;
			}
			newServer.onopen = function () {
			//	console.log("Connected to " + host);
				if (self.server) {
					self.disconnect();
				}
				self.server = newServer;
				self.server.host = host;
				self.server.port = port;
				self.open = true;
				self.once('clientID', function (data){
					self.id = data.id;
				});
				if (parameters.onSuccess) parameters.onSuccess.call(self);
			};
			newServer.onmessage = function (e) {
				var data = JSON.parse(e.data);
				if (self._events[data.name]) {
					for (var i = 0, l = self._events[data.name].length; i < l; i++) {
						if (typeof self._events[data.name][i] === 'function') {
							self._events[data.name][i].call(this, data.data);
						}
					}
				}
			};
			newServer.onerror = function () {
				self.open = false;
				if (failure) failure();
			};
			newServer.onclose = function () {
				if (!self.open) return; // Prevent this listener from executing when the connection is refused
				self.open = false;
				// Reonnect to the current server first
				self.connect({
					host: self.server.host,
					port: self.server.port,
					onSuccess: function () {
						// Rejoin group if currently in one
						if (self.currentGroupSession) {
							self.joinGroup({
								groupID: self.currentGroupSession.id,
								onFoundGroup: function (groupSession) {
									self.trigger('rejoinedGroup', groupSession);
								}
							});
						}
						self.trigger('reconnected');
					},
					onFailure: function () {
						// If that does not work, connect to any server
						self.connect({ 
							onSuccess: function () {
								// Rejoin group if currently in a group
								if (self.currentGroupSession) {
									self.joinGroup({
										groupID: self.currentGroupSession.id,
										onFoundGroup: function (groupSession) {
											self.trigger('rejoinedGroup', groupSession);
										}
									});
								}
								self.trigger('reconnected');
							},
							onFailure: parameters.onFailure  // Failed to reconnect to any server
						});
					}
				});
				self.trigger('disconnect');
				if (self.currentGroupSession) {
					self.trigger('disconnectedFromGroup');
				}
			}
		}

		if (parameters.host && parameters.port) {
			// Connect to a specific server
			createConnection(parameters.host, parameters.port, parameters.onSuccess, function () {
				if (parameters.onFailure) parameters.onFailure.call(self, "Connection refused");
			});
		} else if (self.servers.length > 0) {
			// Connect to any possible server
			var attemptNum = 0;
			// Select a random server to start with for the sake of load balancing
			var startIndex = Math.floor(Math.random() * self.servers.length);
			function connectToAnyServer () {
				serverIndex = (startIndex + attemptNum) % self.servers.length;
				attemptNum++;
				if (attemptNum <= self.servers.length) {
					createConnection(	self.servers[serverIndex].host, 
										self.servers[serverIndex].port,
										parameters.onSuccess,
										connectToAnyServer);
				} else if (parameters.onFailure) {
					parameters.onFailure.call(self, "Connection refused to all");
				}
			}
			connectToAnyServer();
		} 
		return this;
	};
	Connection.prototype.disconnect = function() {
		if (this.server) {
			// Remove any current connection
			this.server.onclose = function(){};
			this.server.onerror = function(){};
			this.server.close();
		}
		if (this.currentGroupSession) {
			this.currentGroupSession.connected = false;
		}
	};
	Connection.prototype.setServers = function (servers) {
		this.servers.length = 0;
		for (var i = 0, l = servers.length; i < l; i++) {
			this.servers.push(servers[i]);
		}
		return this;
	};
	// Parameters may include groupID, onFoundGroup, onFailure, onPutInQueue
	Connection.prototype.joinGroup = function(parameters) {
		if (!parameters) parameters = {};
		this.removeListener('_foundGroup'); // Remove old listeners.

		var self = this;
		self.emit('joinGroup', {
			id: parameters.groupID
		});
		self.once('_foundGroup', function (data) {
			self.inGroup = true;
			self.currentGroupSession = new GroupSession(self);
			self.currentGroupSession.setState(data.state);
			self.currentGroupSession.id = data.id;
			self.currentGroupSession.members = data.members;
			if (parameters.onFoundGroup) parameters.onFoundGroup.call(self, self.currentGroupSession);
		});
		if (parameters.onFailure) {	
			self.bind('findGroupError', function (message) {
				 parameters.onFailure.call(self, message);
			});
		}
		if (parameters.onPutInQueue) {
			self.bind('findGroupPutInQueue', function (data) {
				 parameters.onPutInQueue.call(self, data);
			});
		}
		return this;
	};
	Connection.prototype.emit = function (name, data) {
		if (this.server.readyState !== 1) return;
		this.server.send(JSON.stringify({
          name: name,
          data: data || {}
        }));
        return this;
	};
	Connection.prototype.trigger = function(name, data) {
		if (this._events[name]) {
			for (var i = 0, l = this._events[name].length; i < l; i++) {
				if (typeof this._events[name][i] === 'function') {
					this._events[name][i].call(this, data);
				}
			}
		}
		return this;
	};
	Connection.prototype.bind = function (name, fn) {
		if (typeof fn !== 'function') throw "Bind requires a function as a callback";
		if (!this._events[name]) {
			this._events[name] = [];
		}
		console.log()
		this._events[name].push(fn);
		return this;
	};
	Connection.prototype.removeListener = function(name, fn) {
		if (fn) {
			var self = this;
			for (var i = 0, l = self._events[name].length; i < l; i++) {
				if (self._events[name][i] === fn) {
					self._events[name].splice(i, 1);
				}
			}
		} else {
			this._events[name] = [];
		}
		
		return this;
	};
	Connection.prototype.once = function (name, fn) {
		var self = this;
		this.bind(name, function (data) {
			self.removeListener(name, fn);
			fn.call(self, data);
		});
		return this;
	};

	function State (obj) {
		this._data = obj || {};
	}
	State.prototype.changeState = function (path, obj) {
		var pathSteps =  path.split('/');
		var stateObjectReference = this._data;
		for(var i = 0; i < pathSteps.length; i++){
			if(stateObjectReference[pathSteps[i]] === null || stateObjectReference[pathSteps[i]] === undefined){
				stateObjectReference[pathSteps[i]] = {};
			}
			if(pathSteps[i] !== null){
	            if(i === 0){
					if(pathSteps.length === 1){
						stateObjectReference[pathSteps[i]] = obj;
					} else {
						stateObjectReference = this._data[pathSteps[i]];
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
	State.prototype.get = function () {
		return this._data;
	}

	function GroupSession (server) {
		this.server = server;
		this.id;
		this.members = [];
		this.state = new State();
		this.connected = true;
		
		var self = this;
		this.server.bind('stateChanged', function (data) {
			self.state.changeState(data.path, data.obj);
		});
	}
	GroupSession.prototype.updateState = function(path, obj) {
		this.state.changeState(path, obj);
		this.server.emit('updateState', {
			path: path,
			obj: obj
		});
	};
	GroupSession.prototype.setState = function(obj) {
		this.state = new State(obj);
	};


	window.GroupNet = {
		Connection: Connection,
		State: State,
		GroupSession: GroupSession
	}
})();