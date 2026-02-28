import { User } from '../../auth/dto/entities/user.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';

@Entity('urls')
export class Url {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Index({ unique: true })
  @Column({ unique: true, length: 10 })
  short_code: string;

  @Column('text')
  original_url: string;

  @Index()
  @ManyToOne(() => User, user => user.urls, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User; // Required ownership

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  expires_at: Date;

  @Column({ default: true })
  is_active: boolean; // Soft delete support

  @Column({ type: 'bigint', default: 0 })
  click_count: number; // Denormalized for dashboard speed

  @Column({ default: 'pending' })
  safety_status: string;
}
