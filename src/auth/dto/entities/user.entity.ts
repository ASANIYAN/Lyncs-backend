import { Url } from '../../../url/entities/url.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn({ type: 'bigint' }) // PK as BIGINT per design
  id: string;

  @Index({ unique: true })
  @Column({ unique: true })
  email: string;

  @Column({ select: false }) // Don't return hash in queries by default
  password: string;

  @CreateDateColumn()
  created_at: Date;

  @Column('timestamp', { nullable: true })
  email_verified_at: Date | null;

  @Column('timestamp', { nullable: true })
  last_login_at: Date | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  last_login_ip: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  last_login_user_agent_hash: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  last_login_device_hash: string | null;

  @Column({ default: true })
  is_active: boolean;

  @OneToMany(() => Url, url => url.user)
  urls: Url[];
}
