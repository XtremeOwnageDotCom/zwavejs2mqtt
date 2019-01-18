var express = require('express'),
reqlib = require('app-root-path').require,
path = require('path'),
logger = require('morgan'),
cookieParser = require('cookie-parser'),
bodyParser = require('body-parser'),
app = express(),
fs = require('fs'),
SerialPort = require('serialport'),
jsonStore = reqlib('/lib/jsonStore.js'),
cors = require('cors'),
ZWaveClient = reqlib('/lib/ZwaveClient'),
MqttClient = reqlib('/lib/MqttClient'),
Gateway = reqlib('/lib/Gateway'),
uniqid = require('uniqid'),
store = reqlib('config/store.js'),
utils = reqlib('/lib/utils.js');

var gw; //the gateway instance
let io;

console.log("Application path:", utils.getPath(true));

// view engine setup
app.set('views', utils.joinPath(utils.getPath(), 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(bodyParser.json({limit: "50mb"}));
app.use(bodyParser.urlencoded({limit: "50mb", extended: true, parameterLimit:50000}));
app.use(cookieParser());

app.use('/', express.static(utils.joinPath(utils.getPath(), 'dist')));

app.use(cors());

function startGateway(){
  var config = jsonStore.get(store.config);

  var mqtt, zwave;

  if(config.mqtt){
    mqtt = new MqttClient(config.mqtt);
  }

  if(config.zwave){
    zwave = new ZWaveClient(config.zwave, io);
  }

  gw = new Gateway(config.gateway, zwave, mqtt);
}

app.startSocket = function(server){
  io = require('socket.io')(server);

  if(gw.zwave) gw.zwave.socket = io;

  io.on('connection', function(socket) {

    console.log("New connection", socket.id);

    if(gw.zwave)
      socket.emit('NODES', gw.zwave.nodes)

    socket.on('ZWAVE_API', function(data) {
      console.log("Zwave api call:", data.api, data.args);
        if(gw.zwave){
          var result = gw.zwave.callApi(data.api, ...data.args);
          result.api = data.api;
          socket.emit("API_RETURN", result);

          if(data.refreshNode && data.node > 0){
            gw.zwave.callApi('refreshNodeInfo', data.node);
          }
        }
    });

    socket.on('disconnect', function(){
      console.log('User disconnected', socket.id);
    });

  });
}

// ----- APIs ------

//get config
app.get('/api/config', function(req, res) {
  SerialPort.list(function (err, ports) {
    if (err) {
      console.log(err);
      res.json({success:false, message: "Error getting serial ports", serial_ports:[]});
    }else{
      var devices = gw.zwave ? gw.zwave.devices : {};
      res.json({success:true, config: jsonStore.get(store.config), devices: devices, serial_ports: ports.map(p => p.comName)});
    }
  })
});

//update config
app.post('/api/config', function(req, res) {
  jsonStore.put(store.config, req.body)
  .then(data => {
    res.json({success: true, message: "Configuration updated successfully"});
    gw.close();
    startGateway();
  }).catch(err => {
    console.log(err);
    res.json({success: false, message: err.message})
  })
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  console.log(err);

  // render the error page
  res.status(err.status || 500);
  res.redirect('/');
});

startGateway();

process.removeAllListeners('SIGINT');

process.on('SIGINT', function() {
  console.log('Closing...');
  gw.close();
  process.exit();
});

module.exports = app;
