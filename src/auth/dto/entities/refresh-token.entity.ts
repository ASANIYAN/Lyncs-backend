import {
  Column,
  CreateDateColumn,
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
  user: User;

  @Column()
  token_hash: string;

  @Column('timestamp')
  expires_at: Date;

  @Column({ default: false })
  revoked: boolean;
}

@Entity('blocked_domains')
export class BlockedDomain {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Index({ unique: true })
  @Column({ unique: true, length: 255 })
  domain: string;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @CreateDateColumn()
  added_at: Date;

  @Column({ default: true })
  is_active: boolean;
}
