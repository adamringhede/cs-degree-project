exports.nodes = {
	a: { host: "192.168.0.190", port: 7081, clientsPort: 7080 },
	b: { host: "192.168.0.189", port: 7081, clientsPort: 7080 },
	c: { host: "192.168.0.188", port: 7081, clientsPort: 7080 },
	d: { host: "192.168.0.185", port: 7081, clientsPort: 7080 }
};
var numNodes = 0;
for (var nodeID in exports.nodes) {
	numNodes += 1;
}
exports.numNodes = numNodes;

exports.server = {
	nodeID: "d"
};