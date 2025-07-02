import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import { auth, googleProvider } from './firebaseConfig';
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import './App.css';
import logo from '/logo.png';

// --- Komponenty pro jednotlivé stránky ---
// TUTO KOMPONENTU V SOUBORU App.jsx NAHRAĎTE

const AdminDashboard = ({ user }) => {
  const [trips, setTrips] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [passengers, setPassengers] = useState([]);
  const [isModalLoading, setIsModalLoading] = useState(false);

  const formatDate = (date) => date.toISOString().split('T')[0];

  const fetchTripsByDate = useCallback(async (dateToFetch) => {
    if (!user) return;
    setIsLoading(true);
    setError('');
    const formattedDate = formatDate(dateToFetch);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`http://localhost:41999/api/v1/trips_by_date?date=${formattedDate}`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.detail || 'Chyba serveru'); }
      const data = await response.json();
      setTrips(data);
    } catch (err) {
      setError('Nepodařilo se načíst data.');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchTripsByDate(currentDate);
  }, [currentDate, fetchTripsByDate]);

  const handleRowClick = async (trip) => {
    setSelectedTrip(trip);
    setIsModalLoading(true);
    setPassengers([]);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`http://localhost:41999/api/v1/trips/${trip.trip_id}/passengers`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!response.ok) throw new Error("Chyba při načítání pasažérů.");
      const data = await response.json();
      setPassengers(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsModalLoading(false);
    }
  };

  const handleCloseModal = () => setSelectedTrip(null);
  const handleDateChange = (days) => setCurrentDate(prev => new Date(new Date(prev).setDate(prev.getDate() + days)));
  const handleGoToToday = () => setCurrentDate(new Date());

  // --- NOVÁ FUNKCE PRO ZMĚNU VIDITELNOSTI ---
  const handleVisibilityChange = async (tripId, currentVisibility) => {
    // Optimisticky upravíme UI ihned pro okamžitou odezvu
    setTrips(currentTrips =>
      currentTrips.map(t =>
        t.trip_id === tripId ? { ...t, is_active_for_sale: !currentVisibility } : t
      )
    );

    try {
      const token = await user.getIdToken();
      const response = await fetch(`http://localhost:41999/api/v1/trips/${tripId}/visibility`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_visible: !currentVisibility }),
      });
      if (!response.ok) throw new Error('API call failed');
    } catch (e) {
      console.error("Chyba při změně viditelnosti:", e);
      // Pokud nastane chyba, vrátíme změnu v UI zpět
      alert("Změna viditelnosti se nezdařila.");
      setTrips(currentTrips =>
        currentTrips.map(t =>
          t.trip_id === tripId ? { ...t, is_active_for_sale: currentVisibility } : t
        )
      );
    }
  };

  return (
    <div className="content-box">
      <h2>Přehled jízd</h2>
      <div className="date-nav">
        <button onClick={() => handleDateChange(-1)} className="date-nav-button">‹</button>
        <div className="date-display"><button onClick={handleGoToToday} className="today-button">Dnes</button><h3>{currentDate.toLocaleDateString('cs-CZ')}</h3></div>
        <button onClick={() => handleDateChange(1)} className="date-nav-button">›</button>
      </div>
      {isLoading ? <p>Načítám...</p> : error ? <p className="error-message">{error}</p> : trips.length > 0 ? (
        <table className="routes-table">
          <thead>
            <tr>
              <th>Jízda</th>
              <th>Autobus</th>
              <th>Místa</th>
              <th className="text-center">Jede</th>
            </tr>
          </thead>
          <tbody>
            {trips.map((trip) => (
              <tr key={trip.trip_id}>
                <td onClick={() => handleRowClick(trip)} className="clickable-row">{trip.route_name}</td>
                <td onClick={() => handleRowClick(trip)} className="clickable-row">{trip.bus_name}</td>
                <td onClick={() => handleRowClick(trip)} className="clickable-row">{trip.seats_booked} / {trip.seats_total}</td>
                <td className="text-center">
                  <label className="custom-checkbox-container">
                    <input
                      type="checkbox"
                      checked={trip.is_active_for_sale}
                      onChange={() => handleVisibilityChange(trip.trip_id, trip.is_active_for_sale)}
                    />
                    <span className="checkmark"></span>
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (<p>Pro tento den nebyly nalezeny žádné jízdenky.</p>)}

      {selectedTrip && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Pasažéři pro jízdu {selectedTrip.route_name} ({new Date(selectedTrip.trip_date).toLocaleDateString('cs-CZ')})</h3>
              <button onClick={handleCloseModal} className="modal-close-button">&times;</button>
            </div>
            <div className="modal-body">
              {isModalLoading ? <p>Načítám detaily...</p> : passengers.length > 0 ? (
                <table className="passengers-table">
                  <thead><tr><th>Pasažér / Kontakt</th><th>Sedadlo</th><th>Zakoupil</th></tr></thead>
                  <tbody>
                    {passengers.map((p, index) => (
                      <tr key={index}>
                        <td>{p.passenger_name}{p.passenger_email && (<><br /><small className="contact-info">{p.passenger_email}</small></>)}</td>
                        <td>{p.seat_number}</td>
                        <td>{p.customer_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (<p>Pro tuto jízdu nejsou žádní pasažéři.</p>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Komponenta pro výsledky hledání ---
const SearchResultsPage = () => {
  const [searchParams] = useSearchParams();
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const date = searchParams.get('date');

  useEffect(() => {
    const searchTrips = async () => {
      if (!from || !to || !date) return;
      setIsLoading(true);
      setError('');
      try {
        const response = await fetch(`/api/v1/search?from_location_id=${from}&to_location_id=${to}&date=${date}`);
        if (!response.ok) throw new Error("Chyba při vyhledávání spojů.");
        const data = await response.json();
        setResults(data);
      } catch (e) {
        setError("Nalezeným kritériím neodpovídají žádné spoje.");
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    searchTrips();
  }, [from, to, date]);

  return (
    <div className="content-box">
      <h2>Výsledky hledání</h2>
      <p>Nalezené jízdy pro {new Date(date).toLocaleDateString('cs-CZ')}</p>
      <Link to="/" className="auth-button logout-button" style={{ marginBottom: '20px', display: 'inline-block' }}>‹ Nové hledání</Link>
      {isLoading ? <p>Hledám...</p> : error ? <p className="error-message">{error}</p> : (
        <table className="routes-table">
          <thead><tr><th>Linka</th><th>Odjezd</th><th>Příjezd</th><th>Volných míst</th><th>Cena</th><th></th></tr></thead>
          <tbody>
            {results.map(trip => (
              <tr key={trip.trip_id}>
                <td>{trip.route_name}</td>
                <td>{trip.departure_time}</td>
                <td>{trip.arrival_time}</td>
                <td>{trip.seats_available}</td>
                <td>{new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' }).format(trip.price)}</td>
                <td><button className="auth-button">Koupit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};


const ClientView = ({ user }) => {
  const navigate = useNavigate();
  const [stops, setStops] = useState([]);
  const [isLoadingStops, setIsLoadingStops] = useState(true);

  // Tento useEffect se spustí jen jednou a načte seznam všech zastávek z API
  useEffect(() => {
    const fetchStops = async () => {
      try {
        const response = await fetch('http://localhost:41999/api/v1/bus_points');
        if (!response.ok) {
          throw new Error('Nepodařilo se načíst zastávky');
        }
        const data = await response.json();
        setStops(data);
      } catch (error) {
        console.error("Chyba při načítání zastávek:", error);
      } finally {
        setIsLoadingStops(false);
      }
    };
    fetchStops();
  }, []); // Prázdné pole závislostí zajistí, že se spustí jen jednou

  // Tato funkce se spustí po odeslání formuláře
  const handleSearch = (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const fromId = formData.get('from');
    const toId = formData.get('to');
    const date = formData.get('date');

    if (fromId && toId && date) {
      // Přesměrujeme uživatele na stránku s výsledky a předáme parametry v URL
      navigate(`/search?from=${fromId}&to=${toId}&date=${date}`);
    } else {
      alert("Prosím, vyplňte všechna pole pro vyhledávání.");
    }
  };

  return (
    <div className="content-box">
      <h2>Vyhledat spojení</h2>
      <form onSubmit={handleSearch} className="search-form">
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="from-location">Odkud</label>
            <select id="from-location" name="from" disabled={isLoadingStops} required>
              {isLoadingStops ? (
                <option>Načítám...</option>
              ) : (
                <>
                  <option value="">-- Vyberte výchozí bod --</option>
                  {stops.map(stop => <option key={stop.id} value={stop.id}>{stop.name}</option>)}
                </>
              )}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="to-location">Kam</label>
            <select id="to-location" name="to" disabled={isLoadingStops} required>
              {isLoadingStops ? (
                <option>Načítám...</option>
              ) : (
                <>
                  <option value="">-- Vyberte cíl --</option>
                  {stops.map(stop => <option key={stop.id} value={stop.id}>{stop.name}</option>)}
                </>
              )}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="travel-date">Datum</label>
            <input type="date" id="travel-date" name="date" defaultValue={new Date().toISOString().split('T')[0]} required />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group full-width">
            <button type="submit" className="search-button" disabled={isLoadingStops}>Vyhledat</button>
          </div>
        </div>
      </form>
      <br />
      {/* Odkaz na "Moje jízdenky" pro přihlášené klienty */}
      {user && <Link to="/my-tickets" className="auth-button">Zobrazit moje jízdenky</Link>}
    </div>
  );
};

const MyTicketsPage = ({ user }) => {
  const [tickets, setTickets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => { const fetchTickets = async () => { if (!user) return; setIsLoading(true); try { const token = await user.getIdToken(); const response = await fetch('http://localhost:41999/api/v1/my-tickets', { headers: { 'Authorization': `Bearer ${token}` } }); if (!response.ok) throw new Error("Nepodařilo se načíst jízdenky."); const data = await response.json(); setTickets(data); } catch (e) { console.error(e); } finally { setIsLoading(false); } }; fetchTickets(); }, [user]);
  return (<div className="content-box"><h2>Moje jízdenky</h2><Link to="/" className="auth-button logout-button" style={{ marginBottom: '20px', display: 'inline-block' }}>‹ Zpět</Link>{isLoading ? <p>Načítám...</p> : tickets.length > 0 ? (<table className="routes-table"><thead><tr><th>Číslo jízdenky</th><th>Datum jízdy</th><th>Linka</th><th>Cena</th></tr></thead><tbody>{tickets.map(ticket => (<tr key={ticket.ticket_id}><td>{ticket.ticket_id}</td><td>{new Date(ticket.trip_date).toLocaleDateString('cs-CZ')}</td><td>{ticket.route_name}</td><td>{new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' }).format(ticket.total_price)}</td></tr>))}</tbody></table>) : <p>Zatím nemáte žádné zakoupené jízdenky.</p>}</div>);
};

const SettingsPage = () => <div className="content-box"><h2>Nastavení</h2><p>Tato stránka je ve vývoji.</p><Link to="/">Zpět</Link></div>;
const NotFoundPage = () => <div className="content-box"><h2>404 - Stránka nenalezena</h2><p>Litujeme, ale požadovaná stránka neexistuje.</p><Link to="/" className="auth-button">Zpět na hlavní stránku</Link></div>;

const LoginPage = ({ onEmailLogin, onGoogleLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const handleSubmit = (e) => { e.preventDefault(); onEmailLogin(email, password); };
  return (<div className="content-box login-box"><h2>Přihlášení</h2><form onSubmit={handleSubmit} className="login-form"><div className="form-group"><label htmlFor="email">Email</label><input type="email" id="email" value={email} onChange={e => setEmail(e.target.value)} required /></div><div className="form-group"><label htmlFor="password">Heslo</label><input type="password" id="password" value={password} onChange={e => setPassword(e.target.value)} required /></div><button type="submit" className="auth-button">Přihlásit se</button></form><div className="social-login"><p>Nebo se přihlaste pomocí:</p><button onClick={onGoogleLogin} className="social-button google" title="Přihlásit se přes Google">G</button></div><div className="register-link"><p>Nemáte účet? <Link to="/register">Zaregistrujte se</Link></p></div></div>);
};

const RegisterPage = ({ onRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const handleSubmit = (e) => { e.preventDefault(); onRegister(email, password); };
  return (<div className="content-box login-box"><h2>Registrace</h2><form onSubmit={handleSubmit} className="login-form"><div className="form-group"><label htmlFor="reg-email">Email</label><input type="email" id="reg-email" value={email} onChange={e => setEmail(e.target.value)} required /></div><div className="form-group"><label htmlFor="reg-password">Heslo</label><input type="password" id="reg-password" value={password} onChange={e => setPassword(e.target.value)} required /></div><button type="submit" className="auth-button">Zaregistrovat</button></form><div className="register-link"><p>Máte již účet? <Link to="/">Přihlaste se</Link></p></div></div>);
};

// --- Hlavní App komponenta ---
function App() {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const navigate = useNavigate();

  const checkUserRole = useCallback(async (currentUser) => {
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch('/api/v1/users/me/role', { headers: { 'Authorization': `Bearer ${token}` } });
      if (!response.ok) throw new Error('Role check failed');
      const data = await response.json();
      setUserRole(data.role);
    } catch (e) {
      console.error("Nepodařilo se zjistit roli uživatele z Odoo, nastavuji 'client'.", e);
      setUserRole('client');
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        checkUserRole(currentUser);
      } else {
        setUser(null);
        setUserRole('public');
      }
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, [checkUserRole]);

  const handleEmailRegister = async (email, password) => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      navigate('/');
    } catch (error) {
      alert(`Registrace se nezdařila: ${error.message}`);
    }
  };

  const handleEmailLogin = async (email, password) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/');
    } catch (error) {
      alert("Nesprávný e-mail nebo heslo.");
    }
  };

  const handleGoogleLogin = async () => {
    try { await signInWithPopup(auth, googleProvider); navigate('/'); } catch (error) { console.error(error); }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/');
  };

  const renderContent = () => {
    if (isAuthLoading) {
      return <div className="content-box"><p>Načítám...</p></div>;
    }
    if (user && userRole) {
      if (userRole === 'internal') {
        return <AdminDashboard user={user} />;
      } else { // 'client' or 'portal'
        return <ClientView user={user} />;
      }
    }
    // Pokud není uživatel (je odhlášený)
    return <LoginPage onEmailLogin={handleEmailLogin} onGoogleLogin={handleGoogleLogin} />;
  };

  return (
    <div className="App">
      <header className="top-container">
        <Link to="/" className="logo-area"><img src={logo} alt="Symchera Bus Logo" className="top-logo" /></Link>
        <div className="user-controls">
          {user ? (
            <div className="auth-container">
              <img src={user.photoURL || '/default-avatar.png'} alt="avatar" className="profile-pic" />
              <Link to="/settings" className="user-link">{user.displayName || user.email}</Link>
              <button onClick={handleLogout} className="logout-button-icon" title="Odhlásit se">⏏</button>
            </div>
          ) : (isAuthLoading ? null :
            <div className="auth-container">
              <Link to="/register" className="user-link">Registrovat</Link>
              <Link to="/" className="auth-button">Login</Link>
            </div>
          )}
        </div>
      </header>
      <main className="App-main">
        <div className="content-wrapper">
          <Routes>
            <Route path="/" element={renderContent()} />
            <Route path="/register" element={<RegisterPage onRegister={handleEmailRegister} />} />
            <Route path="/my-tickets" element={user ? <MyTicketsPage user={user} /> : <LoginPage onEmailLogin={handleEmailLogin} onGoogleLogin={handleGoogleLogin} />} />
            <Route path="/settings" element={user ? <SettingsPage /> : <LoginPage onEmailLogin={handleEmailLogin} onGoogleLogin={handleGoogleLogin} />} />
            <Route path="/search" element={<SearchResultsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default App;