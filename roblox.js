import axios from 'axios';
axios.defaults.headers.common['Accept'] = 'application/json';
axios.defaults.headers.post['Content-Type'] = 'application/json';
const thumbnailTypes = {
    GameIcon: ["GameIcon", "512x512"],
    GamePass: ["GamePass", "150x150"],
    DeveloperProduct: ["DeveloperProduct", "420x420"],
    BadgeIcon: ["BadgeIcon", "150x150"],
    PlaceIcon: ["PlaceIcon", "512x512"],
    AvatarHeadShot: ["AvatarHeadShot", "420x420"]
};
const login = (cookie) => {
    axios.defaults.headers.common['Cookie'] = `.ROBLOSECURITY=${cookie}`;
    return axios.get('https://users.roblox.com/v1/users/authenticated')
        .then(response => response.data)
        .catch(error => {
            throw error;
        });
};
const generateBatch = (targetId, type) => ({ requestId: `${targetId}::${type[0]}:${type[1]}:png:regular`, type: type[0], targetId: targetId, token: "", format: "png", size: type[1] });
const getGameThumbnails = (universeIds) => axios.get(`https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${universeIds.join(',')}&countPerUniverse=100&defaults=false&size=768x432&format=Png&isCircular=false`)
    .then(response => response.data.data)
    .catch(error => {
        throw error;
    });
const getThumbnails = (batch) => axios.post('https://thumbnails.roblox.com/v1/batch', batch)
    .then(response => response.data.data)
    .catch(error => {
        throw error;
    });
const getGames = (universeIds) => axios.get(`https://games.roblox.com/v1/games?universeIds=${universeIds.join(',')}`)
    .then(response => response.data.data)
    .catch(error => {
        throw error;
    });
const getGamePasses = (universeId, limit) => axios.get(`https://games.roblox.com/v1/games/${universeId}/game-passes?limit=${limit || 100}&sortOrder=1`)
    .then(response => Promise.all(response.data.data.map(gamepass => axios.get(`https://apis.roblox.com/game-passes/v1/game-passes/${gamepass.id}/product-info`).then(resp => ({ ...gamepass, description: resp.data.Description })))))
    .catch(error => {
        throw error;
    });
const getProducts = (universeId, limit) => axios.get(`https://apis.roblox.com/developer-products/v2/universes/${universeId}/developerproducts?limit=${limit || 100}`)
    .then(response => response.data.developerProducts)
    .catch(error => {
        throw error;
    });
const getBadges = (universeId, limit) => axios.get(`https://badges.roblox.com/v1/universes/${universeId}/badges?limit=${limit || 100}`)
    .then(response => response.data.data)
    .catch(error => {
        throw error;
    });
const getPlaces = (universeId, limit) => axios.get(`https://develop.roblox.com/v1/universes/${universeId}/places?limit=${limit || 100}`)
    .then(response => response.data.data)
    .catch(error => {
        throw error;
    });
const getPresences = (userIds) => axios.post('https://presence.roblox.com/v1/presence/users', { userIds: userIds })
    .then(response => response.data.userPresences)
    .catch(error => {
        throw error;
    });
const getUsers = (userIds) => axios.get(`https://users.roblox.com/v1/users`, { userIds: userIds, excludeBannedUsers: false })
    .then(response => response.data.data)
    .catch(error => {
        throw error;
    });
export default { thumbnailTypes, login, generateBatch, getGameThumbnails, getThumbnails, getGames, getGamePasses, getProducts, getBadges, getPlaces, getPresences, getUsers };