let map;
let userMarker;
let searchCircle;
let isDropPinMode = false;
let nearestContainers = [];

function initMap() {
    // Start with Bratislava as the default center
    const bratislavaCoords = [48.1486, 17.1077];
    map = L.map('map').setView(bratislavaCoords, window.innerWidth < 768 ? 11 : 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    map.on('click', onMapClick);

    getUserLocation();
}

function getUserLocation() {
    if ("geolocation" in navigator) {
        // Clear any existing watch
        if (window.geolocationWatchId) {
            navigator.geolocation.clearWatch(window.geolocationWatchId);
        }

        // Force clear cache by requesting high accuracy position
        const options = {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        };

        navigator.geolocation.getCurrentPosition(
            // Success callback
            function(position) {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                
                console.log("Fresh geolocation:", lat, lng);
                updateMapView(lat, lng);
            },
            // Error callback
            function(error) {
                console.error("Geolocation error:", error);
                handleLocationError(error);
            },
            options
        );
    } else {
        console.log("Geolocation not supported");
        handleLocationError(new Error("Geolocation not supported"));
    }
}

function handleLocationError(error) {
    // First try IP-based geolocation
    fetch('https://ipapi.co/json/')
        .then(response => {
            if (!response.ok) {
                throw new Error('IP geolocation failed');
            }
            return response.json();
        })
        .then(data => {
            if (data.latitude && data.longitude) {
                console.log("IP-based location:", data.latitude, data.longitude);
                updateMapView(data.latitude, data.longitude);
            } else {
                throw new Error('Invalid IP geolocation data');
            }
        })
        .catch(error => {
            console.error("IP Geolocation failed:", error);
            // Only use default location as last resort
            console.log("Using default location");
            updateMapView(48.1486, 17.1077);
        });
}

function updateMapView(lat, lng) {
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
        console.error("Invalid coordinates:", lat, lng);
        return;
    }

    console.log("Updating map view to:", lat, lng);
    
    // Remove existing user marker if it exists
    if (userMarker) {
        map.removeLayer(userMarker);
    }
    
    // Create new user marker
    userMarker = L.marker([lat, lng], {
        title: "Your Location",
        zIndexOffset: 1000 // Ensure user marker is above other markers
    }).addTo(map);
    
    // Update map view
    map.setView([lat, lng], 12);
    
    // Update search circle
    updateSearchCircle(lat, lng);
    
    // Fetch nearby containers
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
        updateNearestContainers(lat, lng, data.elements);
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

    const iconSize = window.innerWidth < 480 ? [20, 33] : [25, 41];
    const clothesIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: iconSize,
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });

    const shoesIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: iconSize,
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
        popupContent += `<br><button class="directions-btn" onclick="getDirections(${container.lat}, ${container.lon})">Get Directions</button>`;

        L.marker([container.lat, container.lon], {icon: icon})
            .addTo(map)
            .bindPopup(popupContent);
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
    }
}

document.addEventListener('DOMContentLoaded', function() {
    initMap();
    
    document.getElementById('getLocation').addEventListener('click', getUserLocation);
    
    document.getElementById('dropPin').addEventListener('click', toggleDropPinMode);

    const navbarToggle = document.getElementById('navbar-toggle');
    const navbarMenu = document.getElementById('navbar-menu');

    navbarToggle.addEventListener('click', function() {
        navbarMenu.classList.toggle('show');
    });
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

function updateNearestContainers(userLat, userLon, containers) {
    nearestContainers = containers.map(container => {
        const distance = calculateDistance(userLat, userLon, container.lat, container.lon);
        return { ...container, distance };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);

    displayNearestContainers();
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function displayNearestContainers() {
    const containerList = document.getElementById('nearest-containers');
    containerList.innerHTML = '';

    nearestContainers.forEach(container => {
        const li = document.createElement('li');
        const isClothes = container.tags["recycling:clothes"] === "yes";
        const isShoes = container.tags["recycling:shoes"] === "yes";
        let containerType = "";

        if (isClothes && isShoes) {
            containerType = "Clothes and Shoes";
        } else if (isClothes) {
            containerType = "Clothes";
        } else if (isShoes) {
            containerType = "Shoes";
        }

        li.innerHTML = `
            <div class="container-type">${containerType} Donation Container</div>
            <div class="container-distance">${container.distance.toFixed(2)} km away</div>
            <button class="directions-btn" onclick="getDirections(${container.lat}, ${container.lon})">Get Directions</button>
        `;
        containerList.appendChild(li);
    });
}
