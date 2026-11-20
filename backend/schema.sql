-- Hooty Hack PostgreSQL schema (generated from app/models.py; the API creates these tables on startup)

CREATE TABLE events (
	id SERIAL NOT NULL, 
	owl_life_id VARCHAR(64) NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	host_organization VARCHAR(200) NOT NULL, 
	description TEXT NOT NULL, 
	starts_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	ends_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	location VARCHAR(200), 
	campus VARCHAR(20) NOT NULL, 
	flyer_url VARCHAR(500), 
	flyer_type VARCHAR(10), 
	flyer_preview_url VARCHAR(500), 
	flyer_text TEXT NOT NULL, 
	rsvp_url VARCHAR(500), 
	owl_life_url VARCHAR(500), 
	is_free BOOLEAN NOT NULL, 
	source_category VARCHAR(80), 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_events_time_order CHECK (ends_at >= starts_at), 
	CONSTRAINT ck_events_flyer_type CHECK (flyer_type IS NULL OR flyer_type IN ('png','jpeg','pdf'))
);

CREATE INDEX ix_events_starts_at ON events (starts_at);
CREATE UNIQUE INDEX ix_events_owl_life_id ON events (owl_life_id);
CREATE INDEX ix_events_ends_at ON events (ends_at);

CREATE TABLE users (
	id SERIAL NOT NULL, 
	email VARCHAR(255) NOT NULL, 
	full_name VARCHAR(120) NOT NULL, 
	password_hash VARCHAR(255) NOT NULL, 
	role VARCHAR(20) NOT NULL, 
	club_name VARCHAR(200), 
	campus VARCHAR(20) NOT NULL, 
	interests VARCHAR(40)[] NOT NULL, 
	settings JSONB NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_users_role CHECK (role IN ('student','admin','club')), 
	CONSTRAINT ck_users_club_name CHECK (role <> 'club' OR club_name IS NOT NULL), 
	CONSTRAINT ck_users_campus CHECK (campus IN ('Kennesaw','Marietta','Both'))
);

CREATE UNIQUE INDEX ix_users_email ON users (email);

CREATE TABLE category_feedback (
	id SERIAL NOT NULL, 
	user_id INTEGER NOT NULL, 
	event_id INTEGER NOT NULL, 
	category VARCHAR(40) NOT NULL, 
	is_correct BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(event_id) REFERENCES events (id) ON DELETE CASCADE
);

CREATE INDEX ix_category_feedback_event_id ON category_feedback (event_id);

CREATE TABLE event_categories (
	event_id INTEGER NOT NULL, 
	category VARCHAR(40) NOT NULL, 
	confidence FLOAT NOT NULL, 
	source VARCHAR(20) NOT NULL, 
	PRIMARY KEY (event_id, category), 
	FOREIGN KEY(event_id) REFERENCES events (id) ON DELETE CASCADE
);


CREATE TABLE interactions (
	id SERIAL NOT NULL, 
	user_id INTEGER NOT NULL, 
	event_id INTEGER NOT NULL, 
	action VARCHAR(10) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_interaction_user_event UNIQUE (user_id, event_id), 
	CONSTRAINT ck_interaction_action CHECK (action IN ('like','skip')), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(event_id) REFERENCES events (id) ON DELETE CASCADE
);

CREATE INDEX ix_interactions_user_id ON interactions (user_id);
CREATE INDEX ix_interactions_event_id ON interactions (event_id);

CREATE TABLE saved_events (
	user_id INTEGER NOT NULL, 
	event_id INTEGER NOT NULL, 
	saved_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (user_id, event_id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(event_id) REFERENCES events (id) ON DELETE CASCADE
);


