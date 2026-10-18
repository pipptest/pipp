import { logOut } from './actions';

// Top navigation for labels.
export default function ClientNav({ name, current }) {
  const links = [
    ['campaigns', '/c', 'Campaigns'],
    ['assets', '/c/assets', 'Assets'],
  ];
  return (
    <nav className="client-nav" aria-label="Label">
      <span className="tag">{name}</span>
      <div className="row">
        {links.map(([key, href, label]) => (
          <a key={key} href={href} className={`tab ${current === key ? 'is-on' : ''}`} aria-current={current === key ? 'page' : undefined}>
            {label}
          </a>
        ))}
        <form action={logOut}><button className="link-button" type="submit">Log out</button></form>
      </div>
    </nav>
  );
}
