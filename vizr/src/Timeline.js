import React, { Component } from 'react'
import ReactDOM from 'react-dom'

import Map from './Map'

export class TimelineData {
  constructor({ keyframe, timestamp, weather }) {
    this.keyframe = keyframe
    this.start = timestamp
    this.events = []
    this.weather = []

    if (weather) {
      this.weather.push(weather)
    }

    this._totalBikes = 0
    this._startOutBikes = 0
    this._currentOutBikes = 0

    keyframe.forEach(station => {
      this._totalBikes += station.bikes
    })
  }

  appending({ timestamp, events, weather }) {
    this.timestamp = timestamp
    this.events = [].concat(this.events, events)

    if (weather) {
      weather.timestamp = timestamp
      this.weather.push(weather)
    }
    events.forEach(e => {
      if (e.t === 'start') {
        this._currentOutBikes += 1
      }
      if (e.t === 'end') {
        this._currentOutBikes -= 1
      }

      if (this._currentOutBikes < 0) {
        this._currentOutBikes = 0
        this._startOutBikes += 1
        this._totalBikes += 1
      }
    })

    return this
  }
}

const TimelineLengthMsec = 24 * 60 * 60 * 7
const HourMsec = 1 * 60 * 60

export default class Timeline extends Component {
  componentDidMount() {
    this._ctx = this._el.getContext('2d')
    this._ctx.fillRect(0, 0, 100, 100)
  }

  componentDidUpdate() {
    const unixRight = Date.now() / 1000
    const unixLeft = unixRight - TimelineLengthMsec

    const { start, events, weather, _startOutBikes, _totalBikes } = this.props.data
    const { width, height } = ReactDOM.findDOMNode(this).getBoundingClientRect()
    const pxPerUnix = width / TimelineLengthMsec

    this._el.width = width
    this._el.height = height
    this._ctx.clearRect(0, 0, width, height)

    // draw gray over the time we don't have data for
    const missingX = Math.min(width, Math.max(0, (start - unixLeft) * pxPerUnix))
    this._ctx.fillStyle = 'rgba(0,0,0,0.15)'
    this._ctx.fillRect(0, 0, missingX, height)

    // draw buckets Xpx wide in the region we have
    const pxWidth = 2
    const windows = []
    for (let px = missingX; px < width; px += pxWidth) {
      const unix = unixLeft + px / pxPerUnix
      windows.push({
        unix,
        px,
        events: events.filter(e => e.ts >= unix && e.ts < unix + pxWidth / pxPerUnix),
      })
    }

    const aggregate = ({ each, then }) => {
      let max = 0
      let min = 1000000
      const values = windows.map(window => Object.assign({}, window, { value: each(window) }))
      values.forEach(({ value }) => {
        max = Math.max(max, value)
        min = Math.min(min, value)
      })
      then({ max, min, values })
    }

    let outbikes = _startOutBikes
    this._ctx.moveTo(0, 0)
    this._ctx.strokeStyle = 'blue'
    this._ctx.beginPath()
    aggregate({
      each: ({ unix, events }) => {
        events.forEach(e => (outbikes += e.t === 'start' ? 1 : -1))
        return outbikes
      },
      then: ({ min, max, values }) => {
        for (const { value, px } of values) {
          this._ctx.lineTo(px, height - value * height / max * 0.85)
        }
      },
    })
    this._ctx.stroke()

    // draw hour markers
    this._ctx.fillStyle = 'black'
    this._ctx.strokeStyle = 'rgba(0,0,0,0.17)'

    this._ctx.beginPath()
    for (let hr = 0; hr < Math.ceil(TimelineLengthMsec / HourMsec); hr++) {
      const unix = start - start % HourMsec + hr * HourMsec
      const x = pxPerUnix * (unix - unixLeft)
      this._ctx.moveTo(x, 26)
      this._ctx.lineTo(x, height)
      this._ctx.font = '14px serif'
      this._ctx.textAlign = hr === 0 ? 'left' : 'center'

      const d = new Date(unix * 1000)
      const h = d.getHours()
      this._ctx.fillText(h > 12 ? `${h - 12}PM` : `${h}AM`, x, 18)
    }
    this._ctx.stroke()

    // draw weather
    this._ctx.strokeStyle = 'rgba(0,0,255,1)'
    this._ctx.beginPath()
    console.log(weather)
    for (const { temp, precip, timestamp } of weather) {
      if (!temp) { continue }
      const x = pxPerUnix * (timestamp - unixLeft)
      console.log(`${temp} ${precip}`)
      this._ctx.lineTo(x, temp * 1)
    }
    this._ctx.stroke()
  }

  render() {
    return (
      <div style={{ width: '100vw', height: '20vh' }}>
        <canvas ref={el => (this._el = el)} width={1} height={1} />
      </div>
    )
  }
}
