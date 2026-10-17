export default function Home() {
  return (
    <main>
      <section className="hero">
        <span className="tag">Private beta</span>
        <h1>Paid posts, without the middleman.</h1>
        <p>pipp connects labels and artists directly with the pages that post their music.</p>
      </section>
      <div className="cols">
        <section className="card">
          <h2>For labels and artists</h2>
          <ul>
            <li>Upload your photos and videos once and reuse them.</li>
            <li>Pick pages by audience, fee and past results.</li>
            <li>Every page gets a caption drafted in its own voice.</li>
            <li>Pay only for posts that go live.</li>
          </ul>
        </section>
        <section className="card">
          <h2>For pages</h2>
          <ul>
            <li>Paid campaigns land in one inbox.</li>
            <li>Post from pipp with one tap, or download and post yourself.</li>
            <li>Nothing is ever posted without your confirmation.</li>
            <li>Get paid when your post is live.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
