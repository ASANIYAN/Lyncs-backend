import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('rate_limits')
@Index(['user_id', 'action', 'window_start']) // Composite index for fast quota checks [cite: 242]
export class RateLimit {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'bigint' })
  user_id: string;

  @Column({ length: 50 })
  action: string; // e.g., 'shorten_url' [cite: 217]

  @Column()
  count: number;

  @Column('timestamp')
  window_start: Date;

  @Column('timestamp')
  expires_at: Date;
}
