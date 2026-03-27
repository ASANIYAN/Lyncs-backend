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

export type OtpPurpose = 'register' | 'forgot_password' | 'login';

@Entity('email_otps')
@Index(['email', 'purpose', 'expires_at'])
@Index(['user_id', 'purpose', 'expires_at'])
export class EmailOtp {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'bigint', nullable: true })
  user_id: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  @Column({ type: 'varchar', length: 20 })
  purpose: OtpPurpose;

  @Column({ type: 'varchar', length: 128 })
  code_hash: string;

  @Column('timestamp')
  expires_at: Date;

  @Column('timestamp', { nullable: true })
  consumed_at: Date | null;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'varchar', length: 64, nullable: true })
  device_hash: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip_address: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  user_agent_hash: string | null;
}
