import React, { Component } from "react";
import ReactDOM from "react-dom";
import SimpleWebsocket from "simple-websocket";
import "./App.css";

const mapboxgl = window.mapboxgl;

mapboxgl.accessToken =
  "pk.eyJ1IjoiYmVuZ29vdHciLCJhIjoiY2pkejFjZGZyMG1mejJ3czk4eDNxODh0NSJ9.8f_aIRuc0MC_8T33befK-Q";

class TimelineData {
  constructor({ keyframe, timestamp, weather }) {
    this.keyframe = keyframe;
    this.start = timestamp;
    this.events = []
    this.weather = [weather];

    this._totalBikes = 0;
    this._startOutBikes = 0;
    this._currentOutBikes = 0;

    keyframe.forEach(station => {
      this._totalBikes += station.bikes
    })
  }

  appending({ timestamp, events, weather }) {
    this.timestamp = timestamp;
    this.events = [].concat(this.events, events);

    if (weather) {
      this.weather.push(weather)
    }
    events.forEach(e => {
      if (e.t === 'start') { this._currentOutBikes += 1 }
      if (e.t === 'end') { this._currentOutBikes -= 1 }

      if (this._currentOutBikes < 0) {
        this._currentOutBikes = 0;
        this._startOutBikes += 1;
        this._totalBikes += 1;
      }
    })

    
    return this;
  }
}

class Timeline extends Component {
  componentDidMount() {
    this._ctx = this._el.getContext("2d");
    this._ctx.fillRect(0, 0, 100, 100);
  }

  componentDidUpdate() {
    const unixRight = Date.now() / 1000;
    const unixLeft = unixRight - 24 * 60 * 60;

    const { start, events, weather, _startOutBikes, _totalBikes } = this.props.data;
    const { width, height } = ReactDOM.findDOMNode(
      this
    ).getBoundingClientRect();
    const pxPerUnix = width / (24 * 60 * 60);

    this._el.width = width;
    this._el.height = height;
    this._ctx.clearRect(0, 0, width, height);

    // draw gray over the time we don't have data for
    const missingX = Math.min(
      width,
      Math.max(0, (start - unixLeft) * pxPerUnix)
    );
    this._ctx.fillStyle = "rgba(0,0,0,0.15)";
    this._ctx.fillRect(0, 0, missingX, height);

    // draw buckets Xpx wide in the region we have
    const pxWidth = 2;
    const windows = [];
    for (let px = missingX; px < width; px += pxWidth) {
      const unix = unixLeft + px / pxPerUnix;
      windows.push({unix, px, events: events.filter(e => e.ts >= unix && e.ts < unix + pxWidth / pxPerUnix)})
    }

    const aggregate = ({ each, then }) => {
      let max = 0;
      let min = 1000000;
      const values = windows.map((window) =>
        Object.assign({}, window, {value: each(window)})
      );
      values.forEach(({value}) => {
        max = Math.max(max, value);
        min = Math.min(min, value);
      })
      then({ max, min, values });
    };

    let outbikes = _startOutBikes;
    this._ctx.moveTo(0, 0);
    this._ctx.strokeStyle = "blue";
    this._ctx.beginPath();
    aggregate({
      each: ({unix, events}) => {
        events.forEach(e => outbikes += e.t === 'start' ? 1 : -1)
        return outbikes
      },
      then: ({ min, max, values }) => {
        for (const {value, px} of values) {
          this._ctx.lineTo(px, height - value * height / max * 0.85);
        }
      }})
      this._ctx.stroke();

    // draw hour markers
    this._ctx.fillStyle = "black";
    this._ctx.strokeStyle = "rgba(0,0,0,0.17)";

    this._ctx.beginPath();
    for (let hr = 0; hr < 25; hr++) {
      const unix = start - start % (60 * 60) + hr * 60 * 60
      const x = pxPerUnix * (unix - unixLeft)
      this._ctx.moveTo(x, 26);
      this._ctx.lineTo(x, height);
      this._ctx.font = '14px serif';
      this._ctx.textAlign = hr === 0 ? 'left' : 'center';

      const d = (new Date(unix * 1000));
      const h = d.getHours();
      this._ctx.fillText(h > 12 ? `${h-12}PM` : `${h}AM`, x, 18);
    }
    this._ctx.stroke();

    // draw weather
    for (const w of weather) {
      console.log(w)
    }
  }

  render() {
    return (
      <div style={{ width: "100vw", height: "20vh" }}>
        <canvas ref={el => (this._el = el)} width={1} height={1} />
      </div>
    );
  }
}

class Map extends Component {
  componentDidMount() {
    this._stationMarkers = [];
    this._map = new mapboxgl.Map({
      container: ReactDOM.findDOMNode(this),
      style: "mapbox://styles/bengootw/cjdz85rzb411g2rmq0rukfhsz",
      center: [-122.347303, 37.803574],
      zoom: 11.5
    });
    this.ensureStations();
  }

  componentDidUpdate() {
    this.ensureStations();
  }

  ensureStations = () => {
    (this.props.stationInfo || []).forEach(station => {
      if (
        !this._stationMarkers.find(m => m.stationId === station.id)
      ) {
        this.displayStation(station);
      }
    });
  };

  displayStation = ({ lat, lon, startBusyness, endBusyness, id }) => {
    var el = document.createElement("div");
    el.className = "station";
    el.style.opacity = 1;
    const f = endBusyness - startBusyness > 0 ? 0 : -260;
    const b = Math.abs(endBusyness - startBusyness) * 300;
    el.style.border = `3px solid hsla(${f},100%,50%, ${b}%)`;
    el.style.width = 5 + (startBusyness + endBusyness) * 12 + "px";
    el.style.height = 5 + (startBusyness + endBusyness) * 12 + "px";

    const marker = new mapboxgl.Marker(el).setLngLat([lon, lat]);
    marker.stationId = id;
    marker.addTo(this._map);
    this._stationMarkers.push(marker);
  };

  displayEvent = ({ t, sid }) => {
    const { lat, lon } = this.props.stationInfo.find(s => s.id === sid);

    var el = document.createElement("div");
    el.className = "marker " + t;
    el.style.width = "10px";
    el.style.height = "10px";

    var inner = document.createElement("div");
    el.appendChild(inner);

    var marker = new mapboxgl.Marker(el).setLngLat([lon, lat]).addTo(this._map);

    setTimeout(() => {
      inner.classList.add("in");
    }, 70);
    setTimeout(() => {
      inner.classList.add("out");
    }, 700);
    setTimeout(() => {
      marker.remove();
    }, 1200);
  };

  render() {
    return <div style={{ width: "100vw", height: "80vh" }} />;
  }
}

class App extends Component {
  constructor(props) {
    super(props);

    this.state = {
      data: null,
      stationInfo: null
    };
  }

  componentDidMount() {
    let socket = new SimpleWebsocket("ws://34.216.74.81:5005");
    socket.on("connect", () => {
      socket.send("sup!");
    });
    socket.on("data", str => {
      const { msg, data } = JSON.parse(str);
      if (msg === "station-info") {
        const { stationInfo } = data;
        this.setState({ stationInfo });
      }
      if (msg === "frame") {
        const { events, timestamp, keyframe, weather } = data;
        
        if (!keyframe) {
          for (const e of events) {
            this._map.displayEvent(e);
          }
        }

        const timeline = this.state.data || new TimelineData({ timestamp, keyframe })
        this.setState({ data: timeline.appending({ events, timestamp, weather }) })
      }
    });
  }

  render() {
    const { stationInfo, data } = this.state;

    if (data === null) {
      return <span/>
    }
    return (
      <div style={{ display: "flex", flexDirection: "column" }}>
        <Map ref={c => (this._map = c)} stationInfo={stationInfo} />
        <Timeline data={data} />
        <div className="overlay">
          <div className="time">
            {new Date(data.timestamp * 1000).toLocaleString()}
            <br/>
            {data._currentOutBikes} / {data._totalBikes}
          </div>
        </div>
      </div>
    );
  }
}

export default App;
