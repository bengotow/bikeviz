import React, { Component } from 'react'
import ReactDOM from 'react-dom'

const mapboxgl = window.mapboxgl

mapboxgl.accessToken =
  'pk.eyJ1IjoiYmVuZ29vdHciLCJhIjoiY2pkejFjZGZyMG1mejJ3czk4eDNxODh0NSJ9.8f_aIRuc0MC_8T33befK-Q'

export default class Map extends Component {
  componentDidMount() {
    this._stationMarkers = []
    this._map = new mapboxgl.Map({
      container: ReactDOM.findDOMNode(this),
      style: 'mapbox://styles/bengootw/cjdz85rzb411g2rmq0rukfhsz',
      center: [-122.347303, 37.803574],
      zoom: 11.5,
    })
    this.ensureStations()
  }

  componentDidUpdate() {
    this.ensureStations()
  }

  ensureStations = () => {
    ;(this.props.stationInfo || []).forEach(station => {
      if (!this._stationMarkers.find(m => m.stationId === station.id)) {
        this.displayStation(station)
      }
    })
  }

  displayStation = ({ lat, lon, startBusyness, endBusyness, id }) => {
    var el = document.createElement('div')
    el.className = 'station'
    el.style.opacity = 1
    const f = endBusyness - startBusyness > 0 ? 0 : -260
    const b = Math.abs(endBusyness - startBusyness) * 300
    el.style.border = `3px solid hsla(${f},100%,50%, ${b}%)`
    el.style.width = 5 + (startBusyness + endBusyness) * 12 + 'px'
    el.style.height = 5 + (startBusyness + endBusyness) * 12 + 'px'

    const marker = new mapboxgl.Marker(el).setLngLat([lon, lat])
    marker.stationId = id
    marker.addTo(this._map)
    this._stationMarkers.push(marker)
  }

  displayEvent = ({ t, sid }) => {
    const { lat, lon } = this.props.stationInfo.find(s => s.id === sid)

    var el = document.createElement('div')
    el.className = 'marker ' + t
    el.style.width = '10px'
    el.style.height = '10px'

    var inner = document.createElement('div')
    el.appendChild(inner)

    var marker = new mapboxgl.Marker(el).setLngLat([lon, lat]).addTo(this._map)

    setTimeout(() => {
      inner.classList.add('in')
    }, 70)
    setTimeout(() => {
      inner.classList.add('out')
    }, 700)
    setTimeout(() => {
      marker.remove()
    }, 1200)
  }

  render() {
    return <div style={{ width: '100vw', height: '80vh' }} />
  }
}
