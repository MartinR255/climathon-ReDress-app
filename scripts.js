let map;
let userMarker;
let searchCircle;
let isDropPinMode = false;
let nearestContainers = [];
let selectedMarker = null;

// Make sure this function is called when the page loads
document.addEventListener('DOMContentLoaded', function() {
    initMap();
    // ... rest of your existing DOMContentLoaded code ...
});

function initMap() {
    // Start with Bratislava as the default center
    const bratislavaCoords = [48.1486, 17.1077];
    map = L.map('map', {
        zoomControl: false  // Disable default zoom controls
    }).setView(bratislavaCoords, window.innerWidth < 768 ? 11 : 12);

    // Add the tile layer (map imagery)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Add zoom control to the bottom right corner
    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);

    map.on('click', onMapClick);

    getUserLocation();

    displayContainerInfo(); // This will clear and hide the container info panel

    updateLegend();
}

function getUserLocation() {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            function(position) {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                updateMapView(lat, lng); // Update the map view with the user's location
            },
            function(error) {
                console.error("Geolocation error:", error);
                handleLocationError(error); // Handle any errors
            }
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
      way["amenity"="recycling"]["recycling:clothes"="yes"](around:${radius},${lat},${lng});
      way["amenity"="recycling"]["recycling:shoes"="yes"](around:${radius},${lat},${lng});
    );
    out center;
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
    const containerIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: iconSize,
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });

    const centerIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: iconSize,
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });

    containers.forEach(container => {
        const isClothes = container.tags["recycling:clothes"] === "yes";
        const isShoes = container.tags["recycling:shoes"] === "yes";
        const isCenter = container.tags["recycling_type"] === "centre";
        const icon = isCenter ? centerIcon : containerIcon;

        const markerLatLng = container.center ? [container.center.lat, container.center.lon] : [container.lat, container.lon];
        const marker = L.marker(markerLatLng, {icon: icon})
            .addTo(map)
            .on('click', function(e) {
                e.originalEvent.stopPropagation();
                L.DomEvent.stopPropagation(e);

                // Close popup of previously selected marker
                if (selectedMarker && selectedMarker !== marker) {
                    selectedMarker.closePopup();
                    selectedMarker.setIcon(selectedMarker.defaultIcon);
                }

                // Highlight the clicked marker
                marker.defaultIcon = icon;
                const highlightedIcon = L.icon({
                    ...icon.options,
                    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-yellow.png'
                });
                marker.setIcon(highlightedIcon);

                // Set this as the new selected marker
                selectedMarker = marker;

                // Create and open popup with container info
                const popupContent = createPopupContent(container);
                marker.unbindPopup(); // Unbind any existing popup
                marker.bindPopup(popupContent, {
                    offset: [0, -30],
                    closeButton: false,
                    maxWidth: 300
                }).openPopup();

                // Update nearest containers in navbar
                updateNearestContainers(userMarker.getLatLng().lat, userMarker.getLatLng().lng, containers);
            });
    });
}

function createPopupContent(container) {
    const isClothes = container.tags["recycling:clothes"] === "yes";
    const isShoes = container.tags["recycling:shoes"] === "yes";
    const isCenter = container.tags["recycling_type"] === "centre";
    
    let containerType = "";
    if (isCenter) {
        containerType = "Recycling Center";
    } else if (isClothes && isShoes) {
        containerType = "Clothes and Shoes Donation";
    } else if (isClothes) {
        containerType = "Clothes Donation";
    } else if (isShoes) {
        containerType = "Shoes Donation";
    }

    const openingHours = container.tags["opening_hours"] || "Not available";

    let popupContent = `
        <div class="popup-content">
            <h3>${containerType}</h3>
            <button class="directions-btn" onclick="getDirections(${container.lat}, ${container.lon})">Get Directions</button>
    `;

    if (isCenter) {
        popupContent += `
            <div class="opening-hours">Opening Hours: ${openingHours}</div>
        `;
    }

    popupContent += `</div>`;

    return popupContent;
}

function toggleDropPinMode() {
    isDropPinMode = !isDropPinMode;
    const dropPinButton = document.getElementById('dropPin');
    
    // Highlight the button when drop pin mode is active
    if (isDropPinMode) {
        dropPinButton.classList.add('active');
    
        map.getContainer().style.cursor = 'crosshair'; // Change cursor
    } else {
        dropPinButton.classList.remove('active');
       
        map.getContainer().style.cursor = ''; // Reset cursor
    }
}

function onMapClick(e) {
    if (isDropPinMode) {
        updateMapView(e.latlng.lat, e.latlng.lng);
        toggleDropPinMode();
    }
    // Remove the auto-collapse behavior when clicking on map
}

document.addEventListener('DOMContentLoaded', function() {
    const navbar = document.getElementById('vertical-navbar');
    const newNavbarToggle = document.getElementById('new-navbar-toggle');
    
    // Remove old event listeners if they exist
    // const navbarToggle = document.getElementById('navbar-toggle');
    // if (navbarToggle) {
    //     navbarToggle.removeEventListener('click', toggleNavbar);
    // }

    // New toggle button click handler
    newNavbarToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        navbar.classList.toggle('expanded');
        updateToggleIcon();
        adjustLegendPosition();
    });

    // Function to update the toggle icon
    function updateToggleIcon() {
        const icon = newNavbarToggle.querySelector('i');
        if (navbar.classList.contains('expanded')) {
            icon.classList.remove('fa-bars');
            icon.classList.add('fa-times');
        } else {
            icon.classList.remove('fa-times');
            icon.classList.add('fa-bars');
        }
    }

    // Close navbar when clicking outside
    document.addEventListener('click', function(e) {
        // Check if the click was on a marker or within the navbar
        const isMarkerClick = e.target.classList.contains('leaflet-marker-icon');
        if (!navbar.contains(e.target) && !isMarkerClick && navbar.classList.contains('expanded')) {
            navbar.classList.remove('expanded');
            updateToggleIcon();
        }
    });

    // ... rest of your existing code ...
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
    if (!containerList) return;
    
    containerList.innerHTML = '';

    nearestContainers.forEach(container => {
        const li = document.createElement('li');
        const isClothes = container.tags["recycling:clothes"] === "yes";
        const isShoes = container.tags["recycling:shoes"] === "yes";
        const isCenter = container.tags["recycling_type"] === "centre";
        let containerType = "";

        if (isCenter) {
            containerType = "Recycling Center";
        } else if (isClothes && isShoes) {
            containerType = "Clothes and Shoes";
        } else if (isClothes) {
            containerType = "Clothes";
        } else if (isShoes) {
            containerType = "Shoes";
        }

        li.innerHTML = `
            <div class="container-type">${containerType} ${isCenter ? '' : 'Container'}</div>
            <div class="container-distance">${container.distance.toFixed(2)} km away</div>
            <button class="directions-btn" onclick="getDirections(${container.lat}, ${container.lon})">Get Directions</button>
        `;
        containerList.appendChild(li);
    });
}

function displayContainerInfo(container) {
    const header = document.querySelector('.selected-point-header');
    const infoPanel = document.getElementById('container-info');

    if (!container) {
        // No container selected, clear the info and hide the panel
        header.innerHTML = `
            Selected Location
            <div class="selected-point-subheader">Click a container on the map to see details</div>
        `;
        infoPanel.innerHTML = '';

        // Remove highlight from previously selected marker
        if (selectedMarker) {
            selectedMarker.setIcon(selectedMarker.defaultIcon);
            selectedMarker = null;
        }

        return;
    }

    // Rest of the existing function for when a container is selected
    const isClothes = container.tags["recycling:clothes"] === "yes";
    const isShoes = container.tags["recycling:shoes"] === "yes";
    const isCenter = container.tags["recycling_type"] === "centre";
    
    let containerType = "";
    if (isCenter) {
        containerType = "Recycling Center";
    } else if (isClothes && isShoes) {
        containerType = "Clothes and Shoes Donation";
    } else if (isClothes) {
        containerType = "Clothes Donation";
    } else if (isShoes) {
        containerType = "Shoes Donation";
    }

    header.innerHTML = `
        ${containerType}
        <div class="selected-point-subheader">Container Details</div>
    `;

    const openingHours = container.tags["opening_hours"] || "Not available";

    let infoHTML = `
        <button class="directions-btn" onclick="getDirections(${container.lat}, ${container.lon})">Get Directions</button>
    `;

    if (isCenter) {
        infoHTML += `
            <div class="opening-hours">Opening Hours: ${openingHours}</div>
        `;
    }

    infoPanel.innerHTML = infoHTML;
}

// You might also want to call this when closing the expanded navbar
function closeNavbar() {
    const navbar = document.getElementById('vertical-navbar');
    navbar.classList.remove('expanded');
    displayContainerInfo(); // This will now also remove the highlight
}

document.addEventListener('DOMContentLoaded', function() {
    const getLocationButton = document.getElementById('getLocation');
    const dropPinButton = document.getElementById('dropPin');

    // Event listener for "Get My Location" button
    getLocationButton.addEventListener('click', function() {
        getUserLocation(); // Call the function to get user location
    });

    // Event listener for "Drop Pin" button
    dropPinButton.addEventListener('click', function() {
        toggleDropPinMode(); // Call the function to toggle drop pin mode
    });

    // Existing code...
});

// Add this function to your scripts.js file
function updateLegend() {
    const legendContent = document.getElementById('legend-content');
    legendContent.innerHTML = `
        <div class="legend-item">
            <div class="legend-color" style="background-color: #00ff00;"></div>
            <span>Clothes/Shoes Container</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background-color: #ff0000;"></div>
            <span>Recycling Center</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background-color: #0000ff;"></div>
            <span>Your Location</span>
        </div>
    `;
}

// You might also want to update the legend when the window is resized
window.addEventListener('resize', updateLegend);

// Add this new function
function adjustLegendPosition() {
    const legend = document.getElementById('map-legend');
    const navbar = document.getElementById('vertical-navbar');

}

// Call adjustLegendPosition on window resize as well
window.addEventListener('resize', adjustLegendPosition);

// Add this to your existing JavaScript
document.getElementById('zoomIn').addEventListener('click', function() {
    map.zoomIn();
});

document.getElementById('zoomOut').addEventListener('click', function() {
    map.zoomOut();
});
