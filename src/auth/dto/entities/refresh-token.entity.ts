import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User; // [cite: 83]

  @Column()
  token_hash: string; // [cite: 83]

  @Column('timestamp')
  expires_at: Date; // [cite: 83]

  @Column({ default: false })
  revoked: boolean; // [cite: 83, 190]
}

@Entity('blocked_domains')
export class BlockedDomain {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Index({ unique: true })
  @Column({ unique: true })
  domain: string; // [cite: 86, 87]

  @Column('text', { nullable: true })
  reason: string; // [cite: 86]
}
