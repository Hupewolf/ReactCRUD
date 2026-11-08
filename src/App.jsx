import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createUser, deleteUser, getUsers, updateUser } from './User'
import './App.css'

const LIMIT = 10
const DEFAULT_FIELDS = ['name', 'avatar']
const HIDDEN_IN_FORM = ['id', 'createdAt']
const INITIAL_QUERY = { search: '', sortBy: 'id', order: 'asc' }

const isAvatarKey = (key) => /avatar|image|photo|picture|thumbnail/i.test(key)
const isDateKey = (key) => /date|created|updated/i.test(key) || /At$/.test(key)
const isPlain = (value) => typeof value !== 'object'

const sampleOf = (users, key) =>
  users.find((u) => u[key] !== undefined && u[key] !== null)?.[key]

function fieldType(key, sample) {
  if (/^colou?r$/i.test(key) && /^#[0-9a-f]{6}$/i.test(String(sample))) return 'color'
  if (typeof sample === 'boolean') return 'checkbox'
  if (typeof sample === 'number') return 'number'
  if (/email/i.test(key)) return 'email'
  if (/phone|tel/i.test(key)) return 'tel'
  return 'text'
}

function formatValue(key, value) {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'boolean') return value ? 'Có' : 'Không'
  if (typeof value === 'object') return JSON.stringify(value)
  if (isDateKey(key)) {
    const d = new Date(value)
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('vi-VN')
  }
  return String(value)
}

let colorCtx = null
const colorCache = new Map()

function readableTextColor(color) {
  if (colorCache.has(color)) return colorCache.get(color)
  colorCtx ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  colorCtx.clearRect(0, 0, 1, 1)
  colorCtx.fillStyle = color
  colorCtx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = colorCtx.getImageData(0, 0, 1, 1).data
  const brightness = a < 128 ? 255 : 0.299 * r + 0.587 * g + 0.114 * b
  const result = brightness > 150 ? '#1f2937' : '#ffffff'
  colorCache.set(color, result)
  return result
}

function rowColors(value) {
  if (typeof value !== 'string' || !CSS.supports('color', value)) return undefined
  return { background: value, color: readableTextColor(value) }
}

function Avatar({ src, name }) {
  const [failed, setFailed] = useState(false)
  const initial = String(name || '?').trim().charAt(0).toUpperCase()

  if (!src || failed) return <div className="avatar avatar-fallback">{initial}</div>
  return (
    <img
      className="avatar"
      src={src}
      alt={String(name || '')}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

function App() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({})
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [query, setQuery] = useState(INITIAL_QUERY)

  const listRef = useRef(null)
  const sentinelRef = useRef(null)
  const abortRef = useRef(null)
  const lastRequestRef = useRef({ pageToLoad: 1, q: INITIAL_QUERY })

  const fields = useMemo(() => {
    const keys = new Set(users.flatMap((u) => Object.keys(u)))
    keys.delete('id')
    return [...keys]
  }, [users])

  const formFields = useMemo(() => {
    const keys = fields.filter(
      (k) => !HIDDEN_IN_FORM.includes(k) && isPlain(sampleOf(users, k)),
    )
    return keys.length ? keys : DEFAULT_FIELDS
  }, [fields, users])

  const sortFields = useMemo(
    () => ['id', ...fields.filter((k) => isPlain(sampleOf(users, k)))],
    [fields, users],
  )

  const avatarKey = fields.find(isAvatarKey)
  const colorKey = fields.find((k) => /^colou?r$/i.test(k))
  const titleKey = fields.includes('name')
    ? 'name'
    : fields.find(
      (k) =>
        typeof sampleOf(users, k) === 'string' && !isAvatarKey(k) && !isDateKey(k),
    )
  const metaKeys = fields.filter((k) => k !== avatarKey && k !== titleKey)

  const fetchPage = useCallback(async (pageToLoad, q) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    lastRequestRef.current = { pageToLoad, q }

    setLoading(true)
    setError(null)
    setHasMore(false)
    try {
      const data = await getUsers({ page: pageToLoad, limit: LIMIT, ...q }, controller.signal)
      setUsers((prev) => (pageToLoad === 1 ? data : [...prev, ...data]))
      setPage(pageToLoad)
      setHasMore(data.length === LIMIT)
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPage(1, INITIAL_QUERY)
    return () => abortRef.current?.abort()
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      const search = searchTerm.trim()
      if (search === query.search) return
      const next = { ...query, search }
      setQuery(next)
      fetchPage(1, next)
    }, 400)
    return () => clearTimeout(timer)
  }, [searchTerm, query, fetchPage])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore || loading) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        observer.disconnect()
        fetchPage(page + 1, query)
      },
      { root: listRef.current, rootMargin: '80px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loading, page, query, users.length, fetchPage])

  // ----- handlers -----
  const scrollTop = () => listRef.current?.scrollTo({ top: 0 })

  const handleSort = (changes) => {
    const next = { ...query, ...changes }
    setQuery(next)
    fetchPage(1, next)
    scrollTop()
  }

  const handleRetry = () => {
    const { pageToLoad, q } = lastRequestRef.current
    fetchPage(pageToLoad, q)
  }

  const handleChange = (e) => {
    const { name, type, value, checked } = e.target
    let parsed = value
    if (type === 'checkbox') parsed = checked
    else if (type === 'number') parsed = value === '' ? '' : Number(value)
    setForm((prev) => ({ ...prev, [name]: parsed }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editingId) {
        const updated = await updateUser(editingId, form)
        setUsers((prev) =>
          prev.map((u) => (u.id === editingId ? { ...u, ...form, ...updated } : u)),
        )
      } else {
        await createUser(form)
        fetchPage(1, query)
        scrollTop()
      }
      setForm({})
      setEditingId(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (user) => {
    setEditingId(user.id)
    setForm(Object.fromEntries(formFields.map((k) => [k, user[k] ?? ''])))
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setForm({})
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Xóa user này?')) return
    try {
      await deleteUser(id)
      setUsers((prev) => prev.filter((u) => u.id !== id))
      if (editingId === id) handleCancelEdit()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Cái bảng</h1>
        <span className="badge">{users.length} đã tải</span>
      </header>

      <form className="card form" onSubmit={handleSubmit}>
        <h2>{editingId ? `Sửa user #${editingId}` : 'Thêm user mới'}</h2>
        <div className="form-grid">
          {formFields.map((key) => {
            const type = fieldType(key, sampleOf(users, key))
            if (type === 'checkbox') {
              return (
                <label className="check" key={key}>
                  <input
                    type="checkbox"
                    name={key}
                    checked={!!form[key]}
                    onChange={handleChange}
                  />
                  {key}
                </label>
              )
            }
            return (
              <input
                key={key}
                name={key}
                type={type}
                placeholder={key}
                value={form[key] ?? ''}
                onChange={handleChange}
                required={key === 'name'}
              />
            )
          })}
        </div>
        <div className="actions">
          <button className="btn primary" type="submit" disabled={saving}>
            {saving ? 'Đang lưu...' : editingId ? 'Cập nhật' : 'Thêm'}
          </button>
          {editingId && (
            <button className="btn" type="button" onClick={handleCancelEdit}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="toolbar">
        <input
          className="search"
          placeholder="Tìm kiếm..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select
          value={query.sortBy}
          onChange={(e) => handleSort({ sortBy: e.target.value })}
        >
          {sortFields.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <select
          value={query.order}
          onChange={(e) => handleSort({ order: e.target.value })}
        >
          <option value="asc">Tăng dần</option>
          <option value="desc">Giảm dần</option>
        </select>
      </div>

      {error && (
        <div className="error">
          Lỗi: {error}
          <button className="btn" onClick={handleRetry}>
            Thử lại
          </button>
        </div>
      )}

      <div className="list" ref={listRef}>
        {users.map((u) => {
          const colors = colorKey ? rowColors(u[colorKey]) : undefined
          return (
            <div className={colors ? 'row colored' : 'row'} style={colors} key={u.id}>
              <span className="id">#{u.id}</span>
              <Avatar src={avatarKey && u[avatarKey]} name={titleKey && u[titleKey]} />
              <div className="name">
                {titleKey ? formatValue(titleKey, u[titleKey]) : `User ${u.id}`}
              </div>
              <div className="fields">
                {metaKeys.map((k) => {
                  const text = formatValue(k, u[k])
                  if (!text) return null
                  return (
                    <div className="field" key={k}>
                      <span className="label">{k}</span>
                      <span className="value" title={text}>
                        {text}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="actions">
                <button className="btn" onClick={() => handleEdit(u)}>
                  Chỉnh sửa
                </button>
                <button className="btn danger" onClick={() => handleDelete(u.id)}>
                  Xóa
                </button>
              </div>
            </div>
          )
        })}

        {loading && (
          <div className="status">
            <span className="spinner" /> Đang tải...
          </div>
        )}
        {!loading && !error && users.length === 0 && (
          <div className="status">Không có user</div>
        )}
        {!loading && !hasMore && users.length > 0 && !error && (
          <div className="status">Đã hết danh sách</div>
        )}

        <div ref={sentinelRef} style={{ height: 1 }} />
      </div>
    </div>
  )
}

export default App