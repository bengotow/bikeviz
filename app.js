var Server = require("simple-websocket/server");
const request = require("request");
const fs = require("fs");
const AWS = require("aws-sdk");
const AWSBucket = 'sfbike';

AWS.config.loadFromPath("./config.json");

let last24 = [];

let stationInfo = null;
let stationStatus = null;
let stationStatusLastUpdated = null;
let stationHourFrame = null;
let shouldResetFrame = true;

const s3 = new AWS.S3();

function writeHourFrame(json, key) {
  s3.putObject({ Bucket: AWSBucket, Key: key, Body: JSON.stringify(json) }, (err, data) => {
    if (err) {
      console.log(err);
    } else {
      console.log(`Successfully uploaded data to ${AWSBucket}/${key}`);
    }
  });
}

function fetchStationInfo(callback) {
  request(
    "https://gbfs.fordgobike.com/gbfs/en/station_information.json",
    (err, resp) => {
      if (err) {
        console.error(err);
        return;
      }
      try {
        stationInfo = JSON.parse(resp.body).data.stations;
      } catch (err) {
        console.error(err);
        return;
      }
      console.log("refreshed station info");
      if (callback) {
        callback();
      }
    }
  );
}

function parseStatusResponse(text) {
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (err) {
    console.error(err);
    return {};
  }

  const nextStationStatus = json.data.stations;
  const nextLastUpdated = json.last_updated;

  // rename some keys in the json and remove some keys that we don't care for.
  // reduces the storage size of one station status update by 60%!
  for (const station of nextStationStatus) {
    delete station.eightd_has_available_keys
    station.id = station.station_id
    delete station.station_id
    station.ts = station.last_reported
    delete station.last_reported

    // remove num_ and _available parts of keys
    for (const key of Object.keys(station)) {
      const shortened = key.replace('num_', '').replace('_available', '')
      if (key !== shortened) {
        station[shortened] = station[key]
        delete station[key]
      }
    }

    // switch is_installed, etc. to negative bools and keep them only when necessary
    // is_returning = 1 goes away, is_returning = 0 becomes not_returning = 1
    for (const key of ['is_installed', 'is_renting', 'is_returning']) {
      if (station[key] === 0) { station[key.replace('is_', 'not_')] = 1 }
      delete station[key];
    }
  }

  return { nextLastUpdated, nextStationStatus }
}

function fetchStatus() {
  request(
    "https://gbfs.fordgobike.com/gbfs/en/station_status.json",
    (err, resp) => {
      if (err) {
        console.error(err);
        return;
      }

      const { nextStationStatus, nextLastUpdated } = parseStatusResponse(resp.body);
      if (!nextStationStatus || stationStatusLastUpdated === nextLastUpdated) {
        return;
      }

      // if this is the initial state of the system, set it and return
      if (!stationStatus) {
        stationStatus = nextStationStatus;
        stationStatusLastUpdated = nextLastUpdated;
        stationHourFrame = {
          timestamp: nextLastUpdated,
          keyframe: nextStationStatus,
          events: []
        };
        last24.push(stationHourFrame);
        return;
      }

      // add events to the current frame
      const newEvents = eventsBetween(
        stationStatus,
        nextStationStatus,
        nextLastUpdated
      );
      stationHourFrame.events.push(...newEvents);
      stationStatus = nextStationStatus;
      stationStatusLastUpdated = nextLastUpdated;

      // if a new recording frame should be started, write the old one to S3 and open a new one
      if (shouldResetFrame) {
        shouldResetFrame = false;
        const date = new Date(stationHourFrame.timestamp * 1000)
        writeHourFrame(stationHourFrame, `${date.toISOString().split(':').shift()}.json`)

        stationHourFrame = {
          timestamp: nextLastUpdated,
          keyframe: nextStationStatus,
          events: []
        };

        last24.push(stationHourFrame);
        if (last24.length > 24) {
          last24.shift();
        }
      }

      emitToListeners(newEvents, nextLastUpdated);
    }
  );
}

function eventsBetween(last, next, time) {
  let events = [];
  for (let ii = 0; ii < last.length; ii++) {
    const lastStation = last[ii];
    const nextStation = next[ii];
    const dockChange =
      nextStation.num_docks_available - lastStation.num_docks_available;

    if (dockChange < 0) {
      for (let x = 0; x < -dockChange; x++) {
        events.push({
          t: "end",
          ts: time,
          sid: nextStation.id
        });
      }
    } else if (dockChange > 0) {
      for (let x = 0; x < dockChange; x++) {
        events.push({
          t: "start",
          ts: time,
          sid: nextStation.id
        });
      }
    }
  }

  console.log(JSON.stringify(events, null, 2));
  return events;
}

let connections = [];

function emitToListeners(events, timestamp) {
  connections.forEach(socket => {
    socket.write(JSON.stringify({ msg: "frame", data: { events, timestamp } }));
  });
  console.log(connections.length);
}

fetchStationInfo(() => {
  fetchStatus();

  setInterval(fetchStationInfo, 600 * 1000);
  setInterval(fetchStatus, 10 * 1000);

  const server = new Server({ port: 5005 });

  server.on("connection", function (socket) {
    connections.push(socket);

    socket.write(
      JSON.stringify({ msg: "station-info", data: { stationInfo } })
    );
    last24.forEach(data => {
      socket.write(JSON.stringify({ msg: "frame", data }));
    });
    socket.on("error", () => {
      connections = connections.filter(c => c != socket);
    });
    socket.on("close", () => {
      connections = connections.filter(c => c != socket);
    });
  });
});

function rollHourFrame() {
  shouldResetFrame = true;
  setTimeout(rollHourFrame, 60 * 60 * 1000);
}

const msToNextHour = Math.abs((Date.now() - 1524124800000) % (60 * 60 * 1000));
setTimeout(rollHourFrame, msToNextHour);
