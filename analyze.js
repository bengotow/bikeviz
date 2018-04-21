var Server = require('simple-websocket/server')
var server = new Server({ port: 5005 })

const { allTimes, getAllEvents, allStations, stationStatesAtTime, eventsBetween } = require('./helpers');

// Enhance station info with event data
let maxStartBusyness = 0;
let maxEndBusyness = 0;
const allEvents = getAllEvents();
const allStationsWithExtra = allStations().map(s => {
  s.startBusyness = allEvents.filter(e => e.type === 'trip-started' && e.stationId == s.station_id).length;
  s.endBusyness = allEvents.filter(e => e.type === 'trip-ended' && e.stationId == s.station_id).length;
  maxStartBusyness = Math.max(s.startBusyness, maxStartBusyness);
  maxEndBusyness = Math.max(s.endBusyness, maxEndBusyness);
  return s
}).map(s => {
  s.startBusyness = s.startBusyness / maxStartBusyness;
  s.endBusyness = s.endBusyness / maxEndBusyness;
  return s
})

server.on('connection', function (socket) {
  // Emit events from the recorded data at a nice interval
  const timestamps = allTimes()
  let startTimestamp = timestamps.shift();
  let last = stationStatesAtTime(startTimestamp);
  let timeout = null;
  let bikesOut = 0;

  console.log(`Connected. Replaying ${timestamps.length} samples.`)

  socket.write(JSON.stringify({
    timestamp: startTimestamp,
    stations: allStationsWithExtra
  }));

  socket.on('close', () => {
    clearTimeout(timeout);
  });

  let lastSeen = '3';

  function advanceTimeAndEmitEvents() {
    const timestamp = timestamps.shift();
    const next = stationStatesAtTime(timestamp)
    const events = eventsBetween(last, next, timestamp);
    last = next;

    for (const event of events) {
      if (event.type === 'trip-started') bikesOut += 1;
      if (event.type === 'trip-ended') {
        bikesOut = Math.max(0, bikesOut - 1);
        if (event.stationId !== lastSeen) {
          try {
            event.geojson = require(`./station_routes/${lastSeen}-${event.stationId}.json`)
          } catch (e) {
            event.geojson = require(`./station_routes/${event.stationId}-${lastSeen}.json`)
          }
          lastSeen = event.stationId;
        }
      }
    }
    socket.write(JSON.stringify({
      timestamp: timestamp,
      bikesOut: bikesOut,
      events: events,
    }));

    timeout = null;
    if (timestamps.length > 0) {
      timeout = setTimeout(advanceTimeAndEmitEvents, 80);
    }
  }
  advanceTimeAndEmitEvents();
});

  // const status = require('./status_stream');

// let subscription = status.subscribe(
//   function (x) {
//     console.log('Next: ' + x);
//   },
//   function (err) {
//     console.log('Error: ' + err);
//   },
//   function () {
//     console.log('Completed');
//   });
