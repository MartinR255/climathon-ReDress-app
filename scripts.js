let map;
let userMarker;
let searchCircle;
let isDropPinMode = false;

function initMap() {
    // Start with Bratislava as the default center
    const bratislavaCoords = [48.1486, 17.1077];
    map = L.map('map', {
        zoomControl: false  // Disable default zoom control
    }).setView(bratislavaCoords, 12);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Add zoom control to the bottom right corner
    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);

    map.on('click', onMapClick);

    getUserLocation();
}

function getUserLocation() {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(function(position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            updateMapView(lat, lng);
        }, function(error) {
            console.error("Error getting location:", error);
            alert("Unable to retrieve your location. Using Bratislava as default.");
            updateMapView(48.1486, 17.1077); // Bratislava coordinates
        });
    } else {
        alert("Geolocation is not supported by your browser. Using Bratislava as default.");
        updateMapView(48.1486, 17.1077); // Bratislava coordinates
    }
}

function updateMapView(lat, lng) {
    map.setView([lat, lng], 12);
    
    if (userMarker) {
        map.removeLayer(userMarker);
    }
    
    userMarker = L.marker([lat, lng]).addTo(map);
    
    updateSearchCircle(lat, lng);
    fetchDonationContainers(lat, lng);
}

function updateSearchCircle(lat, lng) {
    if (searchCircle) {
        map.removeLayer(searchCircle);
    }
    
    searchCircle = L.circle([lat, lng], {
        color: 'blue',
        fillColor: '#30f',
        fillOpacity: 0.1,
        radius: 20000 // 20 km in meters
    }).addTo(map);
}

function fetchDonationContainers(lat, lng) {
    const overpassUrl = "https://overpass-api.de/api/interpreter";
    const radius = 20000; // 20 km in meters
    const query = `
    [out:json][timeout:25];
    (
      node["amenity"="recycling"]["recycling:clothes"="yes"](around:${radius},${lat},${lng});
      node["amenity"="recycling"]["recycling:shoes"="yes"](around:${radius},${lat},${lng});
    );
    out body;
    >;
    out skel qt;
    `;

    fetch(overpassUrl, {
        method: 'POST',
        body: query
    })
    .then(response => response.json())
    .then(data => {
        addDonationContainersToMap(data.elements);
    })
    .catch(error => {
        console.error("Error fetching donation containers:", error);
    });
}

function addDonationContainersToMap(containers) {
    // Clear existing markers
    map.eachLayer((layer) => {
        if (layer instanceof L.Marker && layer !== userMarker) {
            map.removeLayer(layer);
        }
    });

    const clothesIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });

    const shoesIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });

    containers.forEach(container => {
        const isClothes = container.tags["recycling:clothes"] === "yes";
        const isShoes = container.tags["recycling:shoes"] === "yes";
        let popupContent = "";
        let icon;

        if (isClothes && isShoes) {
            popupContent = "Clothes and Shoes Donation Container";
            icon = clothesIcon;
        } else if (isClothes) {
            popupContent = "Clothes Donation Container";
            icon = clothesIcon;
        } else if (isShoes) {
            popupContent = "Shoes Donation Container";
            icon = shoesIcon;
        }

        // Add "Get Directions" button to popup content
        popupContent += `<br><button onclick="getDirections(${container.lat}, ${container.lon})">Get Directions</button>`;

        L.marker([container.lat, container.lon], {icon: icon})
            .addTo(map)
            .bindPopup(popupContent)
            .on('click', function(e) {
                // Prevent the map click event from firing when clicking markers
                L.DomEvent.stopPropagation(e);
                
                // Expand navbar when marker is clicked
                const navbar = document.getElementById('vertical-navbar');
                navbar.classList.add('expanded');
            });
    });
}

function toggleDropPinMode() {
    isDropPinMode = !isDropPinMode;
    const dropPinButton = document.getElementById('dropPin');
    dropPinButton.textContent = isDropPinMode ? 'Cancel Drop Pin' : 'Drop Pin';
    map.dragging.enable();
    map.touchZoom.enable();
    map.doubleClickZoom.enable();
    map.scrollWheelZoom.enable();
    map.boxZoom.enable();
    map.keyboard.enable();
    if (isDropPinMode) {
        map.getContainer().style.cursor = 'crosshair';
    } else {
        map.getContainer().style.cursor = '';
    }
}

function onMapClick(e) {
    if (isDropPinMode) {
        updateMapView(e.latlng.lat, e.latlng.lng);
        toggleDropPinMode();
    } else {
        // Collapse navbar when clicking on map (not on markers)
        const navbar = document.getElementById('vertical-navbar');
        navbar.classList.remove('expanded');
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const navbar = document.getElementById('vertical-navbar');
    
    initMap();
    
    document.getElementById('getLocation').addEventListener('click', getUserLocation);
    document.getElementById('dropPin').addEventListener('click', toggleDropPinMode);
});

// Add this new function to handle getting directions
function getDirections(lat, lon) {
    // Get the user's current location (if available)
    if (userMarker) {
        const userLat = userMarker.getLatLng().lat;
        const userLon = userMarker.getLatLng().lng;
        window.open(`https://www.google.com/maps/dir/${userLat},${userLon}/${lat},${lon}`, '_blank');
    } else {
        // If user location is not available, just show directions to the container
        window.open(`https://www.google.com/maps/dir//${lat},${lon}`, '_blank');
    }
}

window.getDirections = function(lat, lon) {
    // Get the user's current location (if available)
    if (userMarker) {
        const userLat = userMarker.getLatLng().lat;
        const userLon = userMarker.getLatLng().lng;
        window.open(`https://www.google.com/maps/dir/${userLat},${userLon}/${lat},${lon}`, '_blank');
    } else {
        // If user location is not available, just show directions to the container
        window.open(`https://www.google.com/maps/dir//${lat},${lon}`, '_blank');
    }
};
