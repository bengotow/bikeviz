import React, { Component } from 'react'
import SimpleWebsocket from 'simple-websocket'
import './App.css'

import Map from './Map'
import Timeline, { TimelineData } from './Timeline'

class App extends Component {
  constructor(props) {
    super(props)

    this.state = {
      data: null,
      stationInfo: null,
    }
  }

  componentDidMount() {
    let socket = new SimpleWebsocket('ws://34.216.74.81:5005')
    socket.on('connect', () => {
      socket.send('sup!')
    })
    socket.on('data', str => {
      const { msg, data } = JSON.parse(str)

      if (msg === 'station-info') {
        const { stationInfo } = data
        this.setState({ stationInfo })
      }
      if (msg === 'frame') {
        const { events, timestamp, keyframe, weather } = data

        if (!keyframe) {
          for (const e of events) {
            this._map.displayEvent(e)
          }
        }

        const timeline = this.state.data || new TimelineData({ timestamp, keyframe })
        this.setState({ data: timeline.appending({ events, timestamp, weather }) })
      }
    })
  }

  render() {
    const { stationInfo, data } = this.state

    if (data === null) {
      return <span />
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Map ref={c => (this._map = c)} stationInfo={stationInfo} />
        <Timeline data={data} />
        <div className="overlay">
          <div className="time">
            {new Date(data.timestamp * 1000).toLocaleString()}
            <br />
            {data._currentOutBikes} / {data._totalBikes}
          </div>
        </div>
      </div>
    )
  }
}

export default App
