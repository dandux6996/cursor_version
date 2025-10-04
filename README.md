# Route & Restaurant Finder

A modern web application that helps users find routes between two locations and discover restaurants along the way. The application displays results in both interactive map format and detailed list format.

## Features

- **Route Planning**: Get driving directions between any two locations
- **Restaurant Discovery**: Find restaurants along the route with ratings, prices, and types
- **Interactive Map**: Visual route display with Google Maps integration
- **Detailed List View**: Comprehensive restaurant information including ratings, addresses, and cuisine types
- **Autocomplete**: Smart location suggestions as you type
- **Responsive Design**: Works seamlessly on desktop and mobile devices

## Setup Instructions

### 1. Google Cloud API Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - Maps JavaScript API
   - Places API
   - Directions API
   - Geocoding API
4. Create credentials (API Key)
5. Restrict your API key to your domain for security

### 2. Configure the Application

1. Open `index.html`
2. Replace `YOUR_API_KEY` with your actual Google Cloud API key:
   ```html
   <script src="https://maps.googleapis.com/maps/api/js?key=YOUR_API_KEY&libraries=places,directions"></script>
   ```

### 3. Run the Application

1. Open `index.html` in a web browser
2. Enter your starting point and destination
3. Click "Find Route & Restaurants" to see results

## File Structure

```
├── index.html          # Main HTML file
├── styles.css          # CSS styling
├── script.js           # JavaScript functionality
└── README.md           # This file
```

## How It Works

1. **Location Input**: Users enter start and destination locations with autocomplete support
2. **Route Calculation**: Google Directions API calculates the optimal driving route
3. **Restaurant Search**: Google Places API searches for restaurants along the route path
4. **Results Display**: 
   - Interactive map shows the route with markers
   - List view displays restaurant details including ratings, prices, and cuisine types

## API Requirements

- **Maps JavaScript API**: For map display and route rendering
- **Places API**: For restaurant search and details
- **Directions API**: For route calculation
- **Geocoding API**: For address to coordinates conversion

## Browser Compatibility

- Chrome (recommended)
- Firefox
- Safari
- Edge

## Security Notes

- Always restrict your API key to specific domains
- Monitor your API usage in the Google Cloud Console
- Consider implementing rate limiting for production use

## Customization

You can customize the application by modifying:

- **Search Radius**: Change the `radius` parameter in `searchNearbyRestaurants()` method
- **Restaurant Types**: Modify the `type` and `keyword` parameters
- **Map Styling**: Update the `styles` array in the `initMap()` method
- **UI Colors**: Modify the CSS variables in `styles.css`

## Troubleshooting

### Common Issues

1. **"Google Maps API failed to load"**: Check your API key and ensure all required APIs are enabled
2. **No restaurants found**: Try increasing the search radius or check if the route passes through populated areas
3. **Autocomplete not working**: Verify that Places API is enabled and properly configured

### API Quota

- The application samples points along the route to find restaurants
- For long routes, consider implementing pagination or limiting the number of search points
- Monitor your API usage in the Google Cloud Console

## License

This project is open source and available under the MIT License.