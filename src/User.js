const BASE_URL = 'https://671891927fc4c5ff8f49fcac.mockapi.io/v2'

async function request(url, options) {
    const res = await fetch(url, options)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
}

export async function getUsers({ page, limit, search, sortBy, order }, signal) {
    const params = new URLSearchParams({ page, limit, sortBy, order })
    if (search) params.set('search', search)
    const data = await request(`${BASE_URL}?${params}`, { signal })
    return data ?? []
}

export function createUser(user) {
    return request(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
    })
}

export function updateUser(id, user) {
    return request(`${BASE_URL}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
    })
}

export function deleteUser(id) {
    return request(`${BASE_URL}/${id}`, { method: 'DELETE' })
}